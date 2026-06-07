"""Data-download + backfill lifecycle orchestrator (Feature 006/009).

Owns the FastAPI BackgroundTask bodies for data downloads and bulk
backfills, the shared bars-CSV materializer used by the validation
engine, and the startup-time sweep that reaps stale `running` rows from
a prior process crash. (The individual-backtest task body was removed:
runs are created only by validation studies and CLI pushes.)

See contracts/background-tasks.md (Feature 006) for the download/backfill task contract;
its backtest sections are historical.
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks

from intraday_trade_spy.storage import SupabaseStorageClient

_log = logging.getLogger(__name__)

_ET = ZoneInfo("America/New_York")


def _today_et() -> date:
    return datetime.now(_ET).date()

DEFAULT_MAX_CONCURRENT_DOWNLOADS_PER_USER = 3
DEFAULT_POLLING_STATUS_MAX_AGE_MINUTES = 15

# Feature 009 backfill defaults (overridden by api.backfill.* in config.yaml).
DEFAULT_BACKFILL_WINDOW_DAYS = 30
DEFAULT_MAX_CONCURRENT_BACKFILLS_PER_USER = 1
DEFAULT_BACKFILL_STALE_TTL_MINUTES = 60


class ConcurrentRunCapExceeded(Exception):
    def __init__(self, active: int, cap: int) -> None:
        super().__init__(f"user has {active} active runs; cap is {cap}")
        self.active = active
        self.cap = cap


def _get_max_concurrent_downloads() -> int:
    try:
        from intraday_trade_spy.config import load_config

        cfg = load_config("config/config.yaml")
        return getattr(cfg.api.data_download, "max_concurrent_per_user", DEFAULT_MAX_CONCURRENT_DOWNLOADS_PER_USER)
    except Exception:
        return DEFAULT_MAX_CONCURRENT_DOWNLOADS_PER_USER


class BarsUnavailableError(RuntimeError):
    """No bars could be produced for the requested range — propagated to
    failure_reason so the run-detail UI can explain why instead of showing
    a cryptic engine crash."""


# yfinance's 5-minute intraday history is capped to ~60 calendar days. Any
# request older than that returns zero rows and we have nothing to backtest.
YFINANCE_5M_LOOKBACK_DAYS = 60

DEFAULT_SOURCE_PREFERENCE = ["alpaca", "yfinance"]


def _get_source_preference() -> list[str]:
    try:
        from intraday_trade_spy.config import load_config

        return load_config("config/config.yaml").data.source_preference
    except Exception:
        return list(DEFAULT_SOURCE_PREFERENCE)


def _dedupe_by_source_preference(bars: list[dict], source_preference: list[str]) -> list[dict]:
    """Keep one bar per bar_start, choosing the highest-precedence source.

    Sources not listed in `source_preference` rank last. Output is sorted
    chronologically by bar_start.
    """
    rank = {s: i for i, s in enumerate(source_preference)}
    fallback = len(source_preference)
    best: dict[str, tuple[int, dict]] = {}
    for b in bars:
        ts = b["bar_start"]
        r = rank.get(b.get("source"), fallback)
        cur = best.get(ts)
        if cur is None or r < cur[0]:
            best[ts] = (r, b)
    return [best[ts][1] for ts in sorted(best)]


def materialize_bars_csv(
    *,
    storage_client: SupabaseStorageClient,
    start: date,
    end: date,
) -> Path:
    """Return a CSV path containing OHLC bars for [start, end].

    Cache-first strategy:
      1. Query the shared `bars` cache for the full range.
      2. Compute which weekdays are missing.
      3. For missing days within the yfinance 60-day lookback window, fetch
         them and upsert into the cache. Days older than 60 days that aren't
         already cached can't be reached — we proceed with whatever bars we
         have (partial coverage > hard failure).
      4. If `bars` is still empty entirely, raise BarsUnavailableError.

    Output CSV matches `Downloader._normalize`'s shape:
        symbol,timestamp,open,high,low,close,volume
    """
    today = date.today()
    cutoff = today - timedelta(days=YFINANCE_5M_LOOKBACK_DAYS)

    bars = storage_client.list_bars(range_start=str(start), range_end=str(end))
    have_dates = {b["bar_start"][:10] for b in bars}
    # Ranges may legitimately extend into the future (the lockbox split ends
    # 2026-12-31 by design) — bars can't exist past today, so never expect
    # (or try to fetch) future days.
    expect_end = min(end, today)
    expected_dates = {
        (start + timedelta(days=i)).isoformat()
        for i in range((expect_end - start).days + 1)
        if (start + timedelta(days=i)).weekday() < 5  # Mon-Fri only
    }
    missing = sorted(expected_dates - have_dates)
    fetchable_missing = [d for d in missing if date.fromisoformat(d) >= cutoff]
    unreachable_missing = [d for d in missing if date.fromisoformat(d) < cutoff]

    if fetchable_missing:
        _log.info(
            "materialize_bars_csv: fetching %d missing day(s) from yfinance",
            len(fetchable_missing),
        )
        _fetch_and_cache_range(
            storage_client=storage_client,
            start=date.fromisoformat(fetchable_missing[0]),
            end=date.fromisoformat(fetchable_missing[-1]),
        )
        bars = storage_client.list_bars(range_start=str(start), range_end=str(end))
        have_dates = {b["bar_start"][:10] for b in bars}

    if not bars:
        if not expected_dates:
            raise BarsUnavailableError(
                "Selected range contains no weekdays — markets are closed on "
                "weekends. Pick a range with at least one Mon–Fri."
            )
        if unreachable_missing and not fetchable_missing:
            raise BarsUnavailableError(
                f"No SPY bars cached for {start} → {end}. yfinance only serves "
                f"intraday 5m bars for the last {YFINANCE_5M_LOOKBACK_DAYS} days, "
                f"and we don't have these dates archived locally yet. Pick a more "
                f"recent range or run a smaller backtest within the last "
                f"{YFINANCE_5M_LOOKBACK_DAYS} days first to start building the archive."
            )
        raise BarsUnavailableError(
            f"No SPY bars available for {start} → {end}. yfinance returned no "
            f"data — common causes: holiday-only range or a future date."
        )

    if unreachable_missing:
        _log.info(
            "materialize_bars_csv: %d unreachable day(s) skipped (outside 60d window, not cached)",
            len(unreachable_missing),
        )

    # Feature 009: when more than one source cached the same timestamp, deliver
    # exactly one bar per bar_start to the engine (no double counting), choosing
    # by data.source_preference (Alpaca preferred over yfinance).
    bars = _dedupe_by_source_preference(bars, _get_source_preference())

    out = Path(tempfile.mkstemp(suffix="_bars.csv")[1])
    import csv as _csv
    with out.open("w", newline="") as f:
        writer = _csv.DictWriter(
            f, fieldnames=["symbol", "timestamp", "open", "high", "low", "close", "volume"]
        )
        writer.writeheader()
        for b in bars:
            writer.writerow(
                {
                    "symbol": "SPY",
                    "timestamp": b["bar_start"],
                    "open": b["open"],
                    "high": b["high"],
                    "low": b["low"],
                    "close": b["close"],
                    "volume": b["volume"],
                }
            )
    return out


def _fetch_and_cache_range(
    *,
    storage_client: SupabaseStorageClient,
    start: date,
    end: date,
) -> None:
    """Download yfinance bars for [start, end] and upsert to the cache."""
    from intraday_trade_spy.data.downloader import (
        Downloader,
        DownloadRequest,
        NoBarsFetchedError,
    )

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tf:
        tmp = Path(tf.name)
    try:
        try:
            Downloader().fetch(
                DownloadRequest(
                    start=start,
                    end=end,
                    timeframe="5m",
                    out=tmp,
                    force=True,
                    show_progress=False,
                )
            )
        except NoBarsFetchedError:
            # Weekend / holiday range with no data — leave the cache as-is.
            return

        import csv as _csv

        with tmp.open() as f:
            reader = _csv.DictReader(f)
            rows = [
                {
                    "bar_start": r["timestamp"],
                    "open": r["open"],
                    "high": r["high"],
                    "low": r["low"],
                    "close": r["close"],
                    "volume": r["volume"],
                    "source": "yfinance",
                }
                for r in reader
                if r.get("symbol") == "SPY"
            ]
        for i in range(0, len(rows), 1000):
            storage_client.upsert_bars(rows[i : i + 1000])
    finally:
        tmp.unlink(missing_ok=True)
        tmp.with_suffix(tmp.suffix + ".fetch.yaml").unlink(missing_ok=True)


def start_data_download(
    *,
    user_id: UUID,
    start_date,
    end_date,
    storage_client: SupabaseStorageClient,
    background_tasks: BackgroundTasks,
) -> UUID:
    cap = _get_max_concurrent_downloads()
    active = storage_client.count_active_data_downloads(user_id=user_id)
    if active >= cap:
        raise ConcurrentRunCapExceeded(active=active, cap=cap)

    job_id = uuid4()
    storage_client.insert_data_download_job(
        job_id=job_id, start_date=start_date, end_date=end_date
    )

    background_tasks.add_task(
        _run_data_download_task,
        job_id=job_id,
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        storage_client=storage_client,
    )
    return job_id


def _run_data_download_task(
    *,
    job_id: UUID,
    user_id: UUID,
    start_date,
    end_date,
    storage_client: SupabaseStorageClient,
) -> None:
    """BackgroundTask body for /api/data/download. Bounded retry per Q3."""
    from intraday_trade_spy.data.downloader import (
        _is_transient_error,
        download_spy,
    )

    try:
        storage_client.update_data_download_job(job_id=job_id, status="running")
    except Exception:
        pass

    backoffs = [1, 2, 4]
    last_exc: Exception | None = None
    csv_bytes: bytes | None = None

    for attempt in range(len(backoffs) + 1):
        try:
            # download_spy returns a Path or DataFrame depending on impl; we
            # synthesize a CSV bytes blob for upload to Supabase Storage.
            df_or_path = download_spy(start=str(start_date), end=str(end_date))
            if hasattr(df_or_path, "to_csv"):
                import io
                buf = io.StringIO()
                df_or_path.to_csv(buf, index=True)
                csv_bytes = buf.getvalue().encode("utf-8")
            else:
                csv_bytes = Path(df_or_path).read_bytes()
            break
        except Exception as exc:
            last_exc = exc
            if not _is_transient_error(exc) or attempt >= len(backoffs):
                break
            time.sleep(backoffs[attempt])

    if csv_bytes is None:
        try:
            storage_client.update_data_download_job(
                job_id=job_id,
                status="failed",
                failure_reason=str(last_exc)[:500] if last_exc else "unknown",
            )
        except Exception:
            pass
        return

    storage_path = f"{user_id}/spy_5m_{start_date}_{end_date}.csv"
    try:
        # Upload via Supabase Storage. Best-effort; if it fails we still mark failed.
        storage_client._client.storage.from_("raw-data").upload(
            storage_path, csv_bytes, {"upsert": "true"}
        )
        storage_client.update_data_download_job(
            job_id=job_id, status="finished", storage_path=storage_path
        )
    except Exception as exc:
        try:
            storage_client.update_data_download_job(
                job_id=job_id, status="failed", failure_reason=str(exc)[:500]
            )
        except Exception:
            pass


class BackfillRangeError(ValueError):
    """Invalid backfill range — maps to a 400 at the endpoint."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _get_backfill_settings() -> tuple[int, int, int]:
    """(window_days, max_concurrent_per_user, stale_job_ttl_minutes) from config."""
    try:
        import yaml

        raw = yaml.safe_load(Path("config/config.yaml").read_text())
        bf = ((raw or {}).get("api") or {}).get("backfill") or {}
        return (
            int(bf.get("window_days", DEFAULT_BACKFILL_WINDOW_DAYS)),
            int(bf.get("max_concurrent_per_user", DEFAULT_MAX_CONCURRENT_BACKFILLS_PER_USER)),
            int(bf.get("stale_job_ttl_minutes", DEFAULT_BACKFILL_STALE_TTL_MINUTES)),
        )
    except Exception:
        return (
            DEFAULT_BACKFILL_WINDOW_DAYS,
            DEFAULT_MAX_CONCURRENT_BACKFILLS_PER_USER,
            DEFAULT_BACKFILL_STALE_TTL_MINUTES,
        )


DEFAULT_BACKFILL_HISTORY_LIMIT = 20


def get_backfill_history_limit() -> int:
    """How many recent backfill jobs the Data page lists (Feature 013 FR-001).

    Read from `api.backfill.history_limit` in config.yaml so the cap is not a
    magic number in the router.
    """
    try:
        import yaml

        raw = yaml.safe_load(Path("config/config.yaml").read_text())
        bf = ((raw or {}).get("api") or {}).get("backfill") or {}
        return int(bf.get("history_limit", DEFAULT_BACKFILL_HISTORY_LIMIT))
    except Exception:
        return DEFAULT_BACKFILL_HISTORY_LIMIT


def _get_alpaca_feed() -> str:
    try:
        from intraday_trade_spy.config import load_config

        return load_config("config/config.yaml").alpaca.feed
    except Exception:
        return "iex"


def _make_bar_source(source: str):
    """Construct a BarSource. NOTE (constitution V): the Alpaca path builds
    ONLY the historical market-data client — never a trading/order client."""
    if source == "alpaca":
        from intraday_trade_spy.data.alpaca_source import AlpacaBarSource

        return AlpacaBarSource(feed=_get_alpaca_feed())
    if source == "yfinance":
        from intraday_trade_spy.data.bar_source import YfinanceBarSource

        return YfinanceBarSource()
    raise ValueError(f"unknown bar source: {source!r}")


def start_backfill(
    *,
    user_id: UUID,
    start_date: date,
    end_date: date,
    storage_client: SupabaseStorageClient,
    background_tasks: BackgroundTasks,
    source: str = "alpaca",
    bar_source=None,
) -> UUID:
    """Validate, enforce the (stale-aware) cap, insert a queued job, enqueue
    the background runner. Returns the new job_id.

    Raises BackfillRangeError(code) on bad input; ConcurrentRunCapExceeded at cap.
    """
    today = _today_et()
    if end_date < start_date:
        raise BackfillRangeError("end_before_start")
    if start_date > today or end_date > today:
        raise BackfillRangeError("future_date")

    window_days, cap, stale_ttl = _get_backfill_settings()
    active = storage_client.count_active_backfills(
        user_id=user_id, stale_after_minutes=stale_ttl
    )
    if active >= cap:
        raise ConcurrentRunCapExceeded(active=active, cap=cap)

    from intraday_trade_spy.data.downloader import iter_windows

    windows = iter_windows(start_date, end_date, max_days=window_days)
    job_id = uuid4()
    storage_client.insert_backfill_job(
        job_id=job_id,
        range_start=start_date,
        range_end=end_date,
        source=source,
        windows_total=len(windows),
    )
    background_tasks.add_task(
        _run_backfill_task,
        job_id=job_id,
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        source=source,
        storage_client=storage_client,
        bar_source=bar_source,
    )
    return job_id


def _run_backfill_task(
    *,
    job_id: UUID,
    user_id: UUID,
    start_date: date,
    end_date: date,
    source: str,
    storage_client: SupabaseStorageClient,
    bar_source=None,
) -> None:
    """BackgroundTask body for the bulk historical backfill (Feature 009).

    Loops fetch windows; upserts each (idempotent via ON CONFLICT DO NOTHING);
    records empty windows as gaps; writes progress; ends finished/failed.
    """
    from intraday_trade_spy.data.downloader import iter_windows

    window_days, _, _ = _get_backfill_settings()
    try:
        storage_client.update_backfill_job(job_id=job_id, status="running")
    except Exception:  # noqa: BLE001 — best effort status write
        pass

    src = bar_source if bar_source is not None else _make_bar_source(source)
    windows = iter_windows(start_date, end_date, max_days=window_days)
    bars_added = 0
    gaps: list[str] = []
    try:
        for i, (ws, we) in enumerate(windows, start=1):
            rows = src.fetch_rows(start=ws, end=we, symbol="SPY", timeframe="5m")
            if not rows:
                gaps.append(f"{ws}..{we}")
            else:
                for j in range(0, len(rows), 1000):
                    bars_added += storage_client.upsert_bars(rows[j : j + 1000])
            storage_client.update_backfill_job(
                job_id=job_id,
                windows_done=i,
                bars_added=bars_added,
                gap_session_dates=gaps,
            )
        storage_client.update_backfill_job(
            job_id=job_id,
            status="finished",
            windows_done=len(windows),
            bars_added=bars_added,
            gap_session_dates=gaps,
        )
    except Exception as exc:  # noqa: BLE001 — surface failure on the job row
        try:
            storage_client.update_backfill_job(
                job_id=job_id, status="failed", failure_reason=str(exc)[:500]
            )
        except Exception:  # noqa: BLE001
            pass


def sweep_stale_runs(max_age_minutes: Optional[int] = None) -> int:
    """Startup hook. Transitions stale `running` rows to `failed`."""
    if max_age_minutes is None:
        try:
            from intraday_trade_spy.config import load_config

            cfg = load_config("config/config.yaml")
            max_age_minutes = getattr(
                cfg.api,
                "polling_status_max_age_minutes",
                DEFAULT_POLLING_STATUS_MAX_AGE_MINUTES,
            )
        except Exception:
            max_age_minutes = DEFAULT_POLLING_STATUS_MAX_AGE_MINUTES

    url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_role_key:
        _log.warning("sweep_stale_runs: SUPABASE_URL/SERVICE_ROLE_KEY not set; skipping")
        return 0

    client = SupabaseStorageClient(
        url=url,
        service_role_key=service_role_key,
        user_id="00000000-0000-0000-0000-000000000000",
    )
    return client.sweep_stale_runs(max_age_minutes=max_age_minutes)
