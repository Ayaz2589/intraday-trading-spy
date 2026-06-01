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

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from intraday_trade_spy.api.deps import auth_user_id, get_storage_client


router = APIRouter()
_log = logging.getLogger(__name__)


class BarsFetchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: _date
    end: _date = Field(description="Inclusive end date.")
    timeframe: str = "5m"


class BarsFetchResponse(BaseModel):
    inserted: int = Field(description="Bars upserted into the cache (excludes duplicates).")
    start: _date
    end: _date


class BarsCoverageResponse(BaseModel):
    earliest: Optional[_date] = Field(description="Date of the oldest cached bar, or null if cache is empty.")
    latest: Optional[_date] = Field(description="Date of the newest cached bar, or null if cache is empty.")


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
