"""Run + data-download lifecycle orchestrator (Feature 006).

Owns the in-memory concurrent-cap tracker (`_active_runs`), the FastAPI
BackgroundTask body for executing a backtest, and the startup-time sweep
that reaps stale `running` rows from a prior process crash.

See contracts/background-tasks.md for the full contract.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4

from fastapi import BackgroundTasks

from intraday_trade_spy.storage import SupabaseStorageClient

_log = logging.getLogger(__name__)

DEFAULT_MAX_CONCURRENT_RUNS_PER_USER = 5
DEFAULT_MAX_CONCURRENT_DOWNLOADS_PER_USER = 3
DEFAULT_POLLING_STATUS_MAX_AGE_MINUTES = 15

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


def start_backtest(
    *,
    user_id: UUID,
    config_name: str,
    data_csv_path: Optional[str],
    storage_client: SupabaseStorageClient,
    background_tasks: BackgroundTasks,
) -> UUID:
    """Validate, reserve a slot, insert the queued row, enqueue the task.

    Returns the new run_id. Raises ConfigNotFoundError if the config doesn't
    exist for the user; ConcurrentRunCapExceeded if at the cap.
    """
    config = storage_client.get_config_by_name(config_name)
    if config is None:
        raise ConfigNotFoundError(config_name)

    strategy_id = config["strategy_id"]
    cap = _get_max_concurrent_runs()
    run_id = uuid4()
    _reserve_slot(user_id, run_id, cap)

    started_at = datetime.now(timezone.utc).isoformat()
    try:
        storage_client.insert_queued_run(
            run_id=run_id,
            config_id=UUID(config["id"]),
            strategy_id=UUID(strategy_id),
            started_at=started_at,
            range_start="2026-01-01",
            range_end="2026-01-01",
            bar_count=1,
            data_fingerprint="pending",
            app_version="api-0.2.0",
        )
    except Exception:
        _release_slot(user_id, run_id)
        raise

    background_tasks.add_task(
        _run_backtest_task,
        run_id=run_id,
        user_id=user_id,
        config_id=UUID(config["id"]),
        strategy_id=UUID(strategy_id),
        data_csv_path=data_csv_path,
        storage_client=storage_client,
    )
    return run_id


def _run_backtest_task(
    *,
    run_id: UUID,
    user_id: UUID,
    config_id: UUID,
    strategy_id: UUID,
    data_csv_path: Optional[str],
    storage_client: SupabaseStorageClient,
) -> None:
    """BackgroundTask body. Transitions queued → running → finished (via atomic
    finalize) or → failed. Always releases the active-runs slot."""
    try:
        storage_client.update_run_status(run_id=run_id, status="running")
        _log.info("backtest %s: started", run_id)

        from intraday_trade_spy.backtest.engine import BacktestEngine
        from intraday_trade_spy.config import load_config
        from intraday_trade_spy.storage.push import gather_run_outputs

        cfg = load_config("config/config.yaml")
        csv_path = Path(data_csv_path) if data_csv_path else Path(cfg.data.csv_path)
        out_dir = Path(cfg.data.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        engine = BacktestEngine(cfg)
        result = engine.run(csv_path=csv_path, output_dir=out_dir)
        run_dir = out_dir / result.run.run_id

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
