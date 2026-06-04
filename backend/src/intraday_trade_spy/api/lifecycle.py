"""Run + data-download lifecycle orchestrator (Feature 006).

Owns the in-memory concurrent-cap tracker (`_active_runs`), the FastAPI
BackgroundTask body for executing a backtest, and the startup-time sweep
that reaps stale `running` rows from a prior process crash.

See contracts/background-tasks.md for the full contract.
"""

from __future__ import annotations

import logging
import os
import tempfile
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks

from intraday_trade_spy.run_spec import compute_spec_hash
from intraday_trade_spy.storage import SupabaseStorageClient

_log = logging.getLogger(__name__)

_ET = ZoneInfo("America/New_York")


def _today_et() -> date:
    return datetime.now(_ET).date()

DEFAULT_MAX_CONCURRENT_RUNS_PER_USER = 5
DEFAULT_MAX_CONCURRENT_DOWNLOADS_PER_USER = 3
DEFAULT_POLLING_STATUS_MAX_AGE_MINUTES = 15

# Feature 009 backfill defaults (overridden by api.backfill.* in config.yaml).
DEFAULT_BACKFILL_WINDOW_DAYS = 30
DEFAULT_MAX_CONCURRENT_BACKFILLS_PER_USER = 1
DEFAULT_BACKFILL_STALE_TTL_MINUTES = 60

_active_runs: dict[UUID, set[UUID]] = {}
_active_runs_lock = threading.Lock()


class ConfigNotFoundError(Exception):
    """No config with the given name exists for this user."""


class ConcurrentRunCapExceeded(Exception):
    def __init__(self, active: int, cap: int) -> None:
        super().__init__(f"user has {active} active runs; cap is {cap}")
        self.active = active
        self.cap = cap


def _reserve_slot(user_id: UUID, run_id: UUID, cap: int) -> None:
    with _active_runs_lock:
        active = _active_runs.setdefault(user_id, set())
        if len(active) >= cap:
            raise ConcurrentRunCapExceeded(active=len(active), cap=cap)
        active.add(run_id)


def _release_slot(user_id: UUID, run_id: UUID) -> None:
    with _active_runs_lock:
        active = _active_runs.get(user_id)
        if active is not None:
            active.discard(run_id)


def _get_max_concurrent_runs() -> int:
    try:
        from intraday_trade_spy.config import load_config

        cfg = load_config("config/config.yaml")
        return getattr(cfg.api, "max_concurrent_runs_per_user", DEFAULT_MAX_CONCURRENT_RUNS_PER_USER)
    except Exception:
        return DEFAULT_MAX_CONCURRENT_RUNS_PER_USER


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
    expected_dates = {
        (start + timedelta(days=i)).isoformat()
        for i in range((end - start).days + 1)
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


def start_backtest(
    *,
    user_id: UUID,
    config_name: str,
    data_csv_path: Optional[str],
    storage_client: SupabaseStorageClient,
    background_tasks: BackgroundTasks,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> UUID:
    """Validate, reserve a slot, insert the queued row, enqueue the task.

    Returns the new run_id. Raises ConfigNotFoundError if the config doesn't
    exist for the user; ConcurrentRunCapExceeded if at the cap.
    """
    config = storage_client.get_config_by_name(config_name)
    if config is None:
        raise ConfigNotFoundError(config_name)

    strategy_id = config["strategy_id"]

    # Dedup: an identical, already-finished backtest over a COMPLETED range
    # returns the existing run instead of recomputing/duplicating. Gated on a
    # completed range (range_end < today ET) because only then is the bar data
    # frozen — a range touching today may have changed since the prior run, so
    # those always re-run (the unique index still dedups them at finalize).
    spec_hash = compute_spec_hash(
        strategy_id=strategy_id,
        params=config.get("params") or {},
        symbol="SPY",
        range_start=start_date,
        range_end=end_date,
    )
    if start_date and end_date and end_date < _today_et():
        existing = storage_client.find_finished_run_by_spec(spec_hash=spec_hash)
        if existing is not None:
            return UUID(existing)

    cap = _get_max_concurrent_runs()
    run_id = uuid4()
    _reserve_slot(user_id, run_id, cap)

    started_at = datetime.now(timezone.utc).isoformat()
    # Use the caller's requested range as the placeholder so the UI's
    # pending-state header reads correctly. The finalize step overwrites
    # these with the actual range derived from the engine's bars.
    placeholder_start = start_date.isoformat() if start_date else "2026-01-01"
    placeholder_end = end_date.isoformat() if end_date else "2026-01-01"
    try:
        storage_client.insert_queued_run(
            run_id=run_id,
            config_id=UUID(config["id"]),
            strategy_id=UUID(strategy_id),
            started_at=started_at,
            range_start=placeholder_start,
            range_end=placeholder_end,
            bar_count=1,
            data_fingerprint="pending",
            app_version="api-0.2.0",
        )
    except Exception:
        _release_slot(user_id, run_id)
        raise

    # Stamp the dedup spec hash (best-effort; no-op pre-migration).
    storage_client.set_run_spec_hash(run_id=run_id, spec_hash=spec_hash)

    background_tasks.add_task(
        _run_backtest_task,
        run_id=run_id,
        user_id=user_id,
        config_id=UUID(config["id"]),
        strategy_id=UUID(strategy_id),
        config_params=config.get("params") or {},
        data_csv_path=data_csv_path,
        storage_client=storage_client,
        start_date=start_date,
        end_date=end_date,
    )
    return run_id


def _run_backtest_task(
    *,
    run_id: UUID,
    user_id: UUID,
    config_id: UUID,
    strategy_id: UUID,
    config_params: Optional[dict] = None,
    data_csv_path: Optional[str],
    storage_client: SupabaseStorageClient,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> None:
    """BackgroundTask body. Transitions queued → running → finished (via atomic
    finalize) or → failed. Always releases the active-runs slot."""
    try:
        storage_client.update_run_status(run_id=run_id, status="running")
        _log.info("backtest %s: started", run_id)

        import json
        from intraday_trade_spy.backtest.engine import BacktestEngine
        from intraday_trade_spy.backtest.manifest import write_run_yaml
        from intraday_trade_spy.config import build_effective_config
        from intraday_trade_spy.journal.exporter import write_journal_csv
        from intraday_trade_spy.storage.push import gather_run_outputs

        # Run with the user's saved knobs (risk/strategy) merged over the base
        # config.yaml — NOT the static defaults. This is what makes the UI knobs
        # actually affect results.
        cfg = build_effective_config(config_params)

        # Record the effective knobs this run used so the detail view shows
        # per-run config (not the shared, mutable live config) and the run stays
        # reproducible. Best-effort; no-ops pre-migration 0092.
        storage_client.set_run_config_snapshot(
            run_id=run_id,
            config_snapshot={
                "risk": cfg.risk.model_dump(mode="json"),
                "strategy": cfg.strategy.model_dump(mode="json"),
            },
        )
        if start_date is not None and end_date is not None:
            csv_path = materialize_bars_csv(
                storage_client=storage_client, start=start_date, end=end_date
            )
        elif data_csv_path:
            csv_path = Path(data_csv_path)
        else:
            csv_path = Path(cfg.data.csv_path)
        out_dir = Path(cfg.data.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        engine = BacktestEngine(cfg)
        result = engine.run(csv_path=csv_path, output_dir=out_dir)

        # Persist the local outputs (same as the CLI's run_backtest.py main()).
        # gather_run_outputs() reads from these files to construct the cloud payload.
        run_dir = out_dir / result.run.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        write_journal_csv(result.journal_rows, run_dir / "journal.csv")
        (run_dir / "summary.json").write_text(
            json.dumps(result.summary.model_dump(), indent=2, sort_keys=True, ensure_ascii=False)
            + "\n"
        )
        write_run_yaml(result.run, run_dir / "run.yaml")

        payload = gather_run_outputs(
            run_dir,
            user_id=user_id,
            config_id=config_id,
            strategy_id=strategy_id,
            run_uuid=run_id,
        )
        storage_client.push_run_finalize(payload)
        _log.info("backtest %s: finished", run_id)

    except Exception as exc:
        _log.exception("backtest %s: failed: %s", run_id, exc)
        try:
            storage_client.update_run_status(
                run_id=run_id,
                status="failed",
                failure_reason=str(exc)[:500],
            )
        except Exception:
            _log.exception("backtest %s: failed AND status update failed", run_id)
    finally:
        _release_slot(user_id, run_id)


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
