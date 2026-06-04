"""POST /api/bars/fetch — synchronous yfinance fetch into the shared bars cache.

Replaces the broken async /data/download lifecycle (download_spy phantom
import bug). The strategy dropdown in the frontend calls this directly
so the user can pull intraday data for a target backtest range without
juggling background jobs.
"""

from __future__ import annotations

import logging
import tempfile
from datetime import date as _date
from pathlib import Path
from uuid import UUID

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from intraday_trade_spy.api.deps import auth_user_id, get_storage_client


router = APIRouter()
_log = logging.getLogger(__name__)


class BarsBackfillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: _date
    end: _date = Field(description="Inclusive end date.")
    source: str = "alpaca"


class BarsBackfillStartResponse(BaseModel):
    job_id: UUID
    status: str


class BackfillJobView(BaseModel):
    job_id: UUID
    status: str
    source: str
    range_start: _date
    range_end: _date
    windows_total: int
    windows_done: int
    bars_added: int
    gap_session_dates: list = Field(default_factory=list)
    failure_reason: Optional[str] = None
    # Feature 013: job history shows when it ran + how long it took.
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


def _job_view(row: dict) -> BackfillJobView:
    return BackfillJobView(
        job_id=row["id"],
        status=row["status"],
        source=row.get("source", "alpaca"),
        range_start=row["range_start"],
        range_end=row["range_end"],
        windows_total=row.get("windows_total", 0),
        windows_done=row.get("windows_done", 0),
        bars_added=row.get("bars_added", 0),
        gap_session_dates=row.get("gap_session_dates") or [],
        failure_reason=row.get("failure_reason"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


class BackfillJobListResponse(BaseModel):
    jobs: list[BackfillJobView] = Field(default_factory=list)


# ---- Feature 013: cache stats (page snapshot) ----


class CacheTotalsView(BaseModel):
    bars: int = 0
    sessions: int = 0
    earliest: Optional[_date] = None
    latest: Optional[_date] = None
    last_updated: Optional[str] = None
    sources: list[str] = Field(default_factory=list)


class MonthStatView(BaseModel):
    month: str  # "YYYY-MM"
    state: str  # complete | partial | current | future
    sessions_present: int
    sessions_expected: int
    bars: int
    sources: list[str] = Field(default_factory=list)
    missing_dates: list[str] = Field(default_factory=list)


class LineageView(BaseModel):
    runs_count: int = 0
    studies_count: int = 0
    latest_run_at: Optional[str] = None


class BarsStatsResponse(BaseModel):
    totals: CacheTotalsView
    months: list[MonthStatView] = Field(default_factory=list)
    lineage: LineageView


@router.post("/bars/backfill", response_model=BarsBackfillStartResponse, status_code=202)
def start_bars_backfill(
    body: BarsBackfillRequest,
    background_tasks: BackgroundTasks,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> BarsBackfillStartResponse:
    """Kick off an in-app background bulk historical backfill (Feature 009)."""
    from intraday_trade_spy.api.lifecycle import (
        BackfillRangeError,
        ConcurrentRunCapExceeded,
        start_backfill,
    )

    try:
        job_id = start_backfill(
            user_id=user_id,
            start_date=body.start,
            end_date=body.end,
            storage_client=storage_client,
            background_tasks=background_tasks,
            source=body.source,
        )
    except BackfillRangeError as exc:
        raise HTTPException(status_code=400, detail={"error": exc.code}) from exc
    except ConcurrentRunCapExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={"error": "backfill_in_progress", "active": exc.active, "cap": exc.cap},
        ) from exc
    return BarsBackfillStartResponse(job_id=job_id, status="queued")


@router.get("/bars/backfill", response_model=BackfillJobListResponse)
def list_bars_backfill_jobs(
    user_id: UUID = Depends(auth_user_id),  # noqa: ARG001 — storage client is user-scoped.
    storage_client=Depends(get_storage_client),
) -> BackfillJobListResponse:
    """Job history for the Data page (Feature 013 US1): the most recent
    backfill jobs, newest first, capped by `api.backfill.history_limit`.
    Failed jobs stay visible with their failure_reason (FR-002)."""
    from intraday_trade_spy.api.lifecycle import get_backfill_history_limit

    rows = storage_client.list_backfill_jobs(limit=get_backfill_history_limit())
    return BackfillJobListResponse(jobs=[_job_view(r) for r in rows])


@router.get("/bars/backfill/{job_id}", response_model=BackfillJobView)
def get_bars_backfill_status(
    job_id: UUID,
    user_id: UUID = Depends(auth_user_id),
    storage_client=Depends(get_storage_client),
) -> BackfillJobView:
    row = storage_client.get_backfill_job(job_id=job_id, user_id=user_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "job_not_found"})
    return _job_view(row)


@router.get("/bars/stats", response_model=BarsStatsResponse)
def bars_stats(
    user_id: UUID = Depends(auth_user_id),  # noqa: ARG001 — auth gate; bars are shared.
    storage_client=Depends(get_storage_client),
) -> BarsStatsResponse:
    """The Data page snapshot (Feature 013): cache totals + per-month
    completeness rows + light lineage. Best-effort per subsection (FR-011) —
    a storage failure degrades that subsection, never 500s the page."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from intraday_trade_spy.api.coverage import month_stats
    from intraday_trade_spy.data.market_calendar import expected_session_dates

    today = datetime.now(ZoneInfo("America/New_York")).date()

    totals = CacheTotalsView()
    months: list[MonthStatView] = []
    try:
        agg = storage_client.bars_monthly_aggregate()
        raw_totals = agg.get("totals") or {}
        totals = CacheTotalsView(**raw_totals)
        rows = month_stats(
            months_raw=agg.get("months") or {},
            earliest=totals.earliest,
            latest=totals.latest,
            expected_dates_provider=lambda s, e: expected_session_dates(s, e, today=today),
            today=today,
        )
        months = [MonthStatView(**r) for r in rows]
    except Exception:  # noqa: BLE001 — best-effort (FR-011)
        _log.exception("bars.stats: aggregate failed; degrading")

    lineage = LineageView()
    try:
        lineage = LineageView(
            runs_count=storage_client.runs_count(),
            studies_count=storage_client.studies_count(),
            latest_run_at=storage_client.latest_run_at(),
        )
    except Exception:  # noqa: BLE001 — best-effort (FR-011)
        _log.exception("bars.stats: lineage failed; degrading")

    return BarsStatsResponse(totals=totals, months=months, lineage=lineage)


class BarsFetchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: _date
    end: _date = Field(description="Inclusive end date.")
    timeframe: str = "5m"


class BarsFetchResponse(BaseModel):
    inserted: int = Field(description="Bars upserted into the cache (excludes duplicates).")
    start: _date
    end: _date


class RegimeCoverageView(BaseModel):
    name: str
    start: _date
    end: _date
    expected_sessions: int
    present_sessions: int
    completeness_pct: float
    covered: bool


class BarsCoverageResponse(BaseModel):
    earliest: Optional[_date] = Field(description="Date of the oldest cached bar, or null if cache is empty.")
    latest: Optional[_date] = Field(description="Date of the newest cached bar, or null if cache is empty.")
    regimes: list[RegimeCoverageView] = Field(
        default_factory=list,
        description="Per-regime completeness (Feature 009): expected vs present NYSE sessions.",
    )


class BarsRefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Number of trading days back from today to ensure are cached. Defaults to
    # 5 so a missed day (e.g. server downtime) is recovered without redundantly
    # re-fetching the entire 60-day window.
    days_back: int = Field(default=5, ge=1, le=60)


@router.post("/bars/refresh", response_model=BarsFetchResponse)
def refresh_bars(
    body: BarsRefreshRequest = Body(default_factory=BarsRefreshRequest),
    user_id: UUID = Depends(auth_user_id),  # noqa: ARG001 — auth gate only.
    storage_client=Depends(get_storage_client),
) -> BarsFetchResponse:
    """Ensure recent SPY bars are in the cache. Called by an external cron
    (Supabase pg_cron / Fly scheduled machine / GitHub Action) on a daily
    cadence so the archive keeps growing past yfinance's 60-day window.

    Fetches `[today - days_back, today]` from yfinance and upserts. Duplicate
    rows are ignored by `bars.UNIQUE(bar_start, source)`.
    """
    from datetime import timedelta as _timedelta

    end = _date.today()
    start = end - _timedelta(days=body.days_back)
    return _fetch_range_into_cache(storage_client, start, end)


def _fetch_range_into_cache(storage_client, start: _date, end: _date) -> BarsFetchResponse:
    """Shared helper: download a range and upsert; returns the inserted count."""
    from intraday_trade_spy.data.downloader import (
        Downloader,
        DownloadRequest,
        NoBarsFetchedError,
    )

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tf:
        tmp_path = Path(tf.name)
    try:
        try:
            Downloader().fetch(
                DownloadRequest(
                    start=start,
                    end=end,
                    timeframe="5m",
                    out=tmp_path,
                    force=True,
                    show_progress=False,
                )
            )
        except NoBarsFetchedError:
            return BarsFetchResponse(inserted=0, start=start, end=end)
        rows = _parse_csv(tmp_path)
        if not rows:
            return BarsFetchResponse(inserted=0, start=start, end=end)
        inserted = 0
        for i in range(0, len(rows), 1000):
            inserted += storage_client.upsert_bars(rows[i : i + 1000])
        return BarsFetchResponse(inserted=inserted, start=start, end=end)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
            tmp_path.with_suffix(tmp_path.suffix + ".fetch.yaml").unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass


@router.get("/bars/coverage", response_model=BarsCoverageResponse)
def bars_coverage(
    user_id: UUID = Depends(auth_user_id),  # noqa: ARG001 — auth gate only.
    storage_client=Depends(get_storage_client),
) -> BarsCoverageResponse:
    cov = storage_client.bars_coverage()

    def _iso_to_date(v):
        if v is None:
            return None
        if isinstance(v, str):
            return _date.fromisoformat(v[:10])
        return v

    return BarsCoverageResponse(
        earliest=_iso_to_date(cov.get("earliest")),
        latest=_iso_to_date(cov.get("latest")),
        regimes=_compute_regime_coverage(storage_client),
    )


def _compute_regime_coverage(storage_client) -> list:
    """Per-regime completeness for the coverage panel (Feature 009 US3)."""
    from intraday_trade_spy.api.coverage import regime_coverage
    from intraday_trade_spy.config import load_config
    from intraday_trade_spy.data.market_calendar import expected_session_count

    try:
        cfg = load_config("config/config.yaml")
    except Exception:  # noqa: BLE001
        return []
    regimes = cfg.data.regimes
    if not regimes:
        return []

    def present_provider(start, end):
        try:
            return storage_client.bars_present_session_dates(
                range_start=start.isoformat(), range_end=end.isoformat()
            )
        except Exception:  # noqa: BLE001 — coverage is best-effort, never 500s
            return []

    return regime_coverage(
        regimes=regimes,
        threshold_pct=cfg.data.regime_covered_threshold_pct,
        present_provider=present_provider,
        expected_provider=expected_session_count,
    )


@router.post("/bars/fetch", response_model=BarsFetchResponse)
def fetch_bars(
    body: BarsFetchRequest = Body(...),
    user_id: UUID = Depends(auth_user_id),  # noqa: ARG001 — auth gate only; bars are shared.
    storage_client=Depends(get_storage_client),
) -> BarsFetchResponse:
    """Download SPY bars from yfinance for [start, end] and upsert to public.bars.

    Bars are a shared cache (not user-scoped), but the endpoint still
    requires auth — anonymous traffic shouldn't be able to hammer yfinance.
    """
    if body.end < body.start:
        raise HTTPException(status_code=400, detail={"error": "end_before_start"})
    if body.timeframe not in ("5m", "1m"):
        raise HTTPException(status_code=400, detail={"error": "unsupported_timeframe"})

    from intraday_trade_spy.data.downloader import (
        Downloader,
        DownloadRequest,
        NoBarsFetchedError,
    )

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tf:
        tmp_path = Path(tf.name)

    try:
        req = DownloadRequest(
            start=body.start,
            end=body.end,
            timeframe=body.timeframe,
            out=tmp_path,
            force=True,
            show_progress=False,
        )
        try:
            Downloader().fetch(req)
        except NoBarsFetchedError as exc:
            raise HTTPException(status_code=404, detail={"error": "no_bars", "message": str(exc)})
        except Exception as exc:  # noqa: BLE001
            _log.exception("bars.fetch: yfinance failed")
            raise HTTPException(
                status_code=502,
                detail={"error": "upstream_failed", "message": str(exc)[:300]},
            ) from exc

        rows = _parse_csv(tmp_path)
        if not rows:
            return BarsFetchResponse(inserted=0, start=body.start, end=body.end)

        # Chunk inserts so a wide range doesn't blow Supabase's request size.
        inserted = 0
        for i in range(0, len(rows), 1000):
            inserted += storage_client.upsert_bars(rows[i : i + 1000])
        return BarsFetchResponse(inserted=inserted, start=body.start, end=body.end)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
            tmp_path.with_suffix(tmp_path.suffix + ".fetch.yaml").unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass


def _parse_csv(path: Path) -> list[dict]:
    """Parse the normalized OHLCV CSV (Downloader output) into upsert rows."""
    import csv

    out: list[dict] = []
    with path.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("symbol") != "SPY":
                continue
            out.append(
                {
                    "bar_start": row["timestamp"],
                    "open": row["open"],
                    "high": row["high"],
                    "low": row["low"],
                    "close": row["close"],
                    "volume": row["volume"],
                    "source": "yfinance",
                }
            )
    return out
