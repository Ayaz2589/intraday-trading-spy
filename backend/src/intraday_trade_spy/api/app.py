"""Top-level FastAPI app (Feature 006).

Replaces the static-file shim from Feature 003. The pre-feature endpoints
stay reachable under `/legacy/` until Feature 007 explicitly migrates the
frontend.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from intraday_trade_spy.api.routers import (
    bars,
    configs,
    data,
    health,
    insights,
    recommend,
    replay,
    research,
    reset,
    runs,
    strategies,
    trade,
    validation,
)

_log = logging.getLogger(__name__)


def _cors_origins() -> list[str]:
    """CORS allow-origins resolved per clarification Q4: env var overrides
    config.yaml defaults; empty env var = use config."""
    env_value = os.environ.get("CORS_ALLOW_ORIGINS", "").strip()
    if env_value:
        return [origin.strip() for origin in env_value.split(",") if origin.strip()]
    # Fall back to config.yaml. Use a lazy-load to avoid importing yaml at module top.
    try:
        from intraday_trade_spy.config import load_config

        cfg = load_config("config/config.yaml")
        api_cfg = getattr(cfg, "api", None)
        if api_cfg is not None and getattr(api_cfg, "cors_allow_origins", None):
            return list(api_cfg.cors_allow_origins)
    except Exception:
        pass
    return ["http://localhost:5173", "http://localhost:5174"]


def _cors_origin_regex() -> str | None:
    """Optional regex for matching deployment-platform preview-branch domains."""
    return os.environ.get("CORS_ALLOW_ORIGIN_REGEX") or None


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Startup hook: run the stale-runs sweep so any rows left in `running`
    by a prior crash get reaped (FR-015). Also best-effort top-up the bars
    cache with the last ~5 trading days so the archive keeps growing past
    yfinance's 60-day window even if the cron operator forgets a day."""
    try:
        from intraday_trade_spy.api.lifecycle import sweep_stale_runs

        sweeped = sweep_stale_runs()
        if sweeped:
            _log.warning("startup: reaped %d stale running runs", sweeped)
    except Exception as exc:
        _log.warning("startup sweep failed: %s", exc)

    try:
        from intraday_trade_spy.api.validation_lifecycle import sweep_stale_studies

        swept_studies = sweep_stale_studies()
        if swept_studies:
            _log.warning("startup: reaped %d stale running studies", swept_studies)
    except Exception as exc:
        _log.warning("startup study sweep failed: %s", exc)

    # Feature 019 (research.md R3): a restart leaves no phantom 'running'
    # campaigns — they fail explicitly with the reason.
    try:
        from intraday_trade_spy.api.routers.research import (
            reconcile_interrupted_campaigns,
        )
        from intraday_trade_spy.storage import SupabaseStorageClient

        if all(os.environ.get(k) for k in
               ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_USER_ID")):
            failed = reconcile_interrupted_campaigns(
                SupabaseStorageClient.from_env()
            )
            if failed:
                _log.warning("startup: failed %d interrupted campaigns", failed)
    except Exception as exc:
        _log.warning("startup campaign reconcile failed: %s", exc)

    # Feature 021 (FR-009): a restart never silently resumes a paper-trading
    # session — interrupted explicitly, journaled, operator restarts it.
    try:
        from intraday_trade_spy.api.routers.trade import (
            reconcile_interrupted_paper_sessions,
        )
        from intraday_trade_spy.storage import SupabaseStorageClient

        if all(os.environ.get(k) for k in
               ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_USER_ID")):
            interrupted = reconcile_interrupted_paper_sessions(
                SupabaseStorageClient.from_env()
            )
            if interrupted:
                _log.warning(
                    "startup: interrupted %d paper session(s)", interrupted
                )
    except Exception as exc:
        _log.warning("startup paper-session reconcile failed: %s", exc)

    # Skip the bars catch-up in test/CI (no real Supabase + no real network).
    if os.environ.get("STARTUP_BARS_REFRESH", "1") != "0":
        try:
            _startup_bars_refresh()
        except Exception as exc:  # noqa: BLE001
            _log.info("startup bars refresh skipped: %s", exc)
    yield


def _startup_bars_refresh() -> None:
    """Top-up the shared bars cache with the last few trading days.

    Idempotent: ON CONFLICT (bar_start, source) DO NOTHING on the upsert.
    Errors are swallowed by the caller so a yfinance hiccup never blocks
    the server from coming up.
    """
    from datetime import date as _d
    from datetime import timedelta as _td

    from intraday_trade_spy.storage import SupabaseStorageClient

    url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    user_id = os.environ.get("SUPABASE_USER_ID")
    if not (url and service_role_key and user_id):
        return

    client = SupabaseStorageClient(url=url, service_role_key=service_role_key, user_id=user_id)
    end = _d.today()
    start = end - _td(days=5)
    from intraday_trade_spy.api.routers.bars import _fetch_range_into_cache

    inserted = _fetch_range_into_cache(client, start, end).inserted
    if inserted:
        _log.info("startup bars refresh: cached %d new bars (%s → %s)", inserted, start, end)


def create_app() -> FastAPI:
    app = FastAPI(
        title="intraday-trade-spy API",
        version="0.2.0",
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_origin_regex=_cors_origin_regex(),
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # Unauthenticated routes
    app.include_router(health.router)

    # Authenticated /api/* routes
    app.include_router(runs.router, prefix="/api")
    app.include_router(strategies.router, prefix="/api")
    app.include_router(data.router, prefix="/api")
    app.include_router(configs.router, prefix="/api")
    app.include_router(bars.router, prefix="/api")
    app.include_router(validation.router, prefix="/api")
    app.include_router(insights.router, prefix="/api")
    app.include_router(recommend.router, prefix="/api")
    app.include_router(research.router, prefix="/api")
    app.include_router(trade.router, prefix="/api")
    app.include_router(replay.router, prefix="/api")
    app.include_router(reset.router, prefix="/api")

    # NOTE: Feature 003's static-file endpoints continue to live in
    # `intraday_trade_spy.api.static_server:app` and are served via the
    # `intraday-trade-spy-server` console script (`make ui-server`). They
    # are unchanged by this feature. Run them on a different port (8000)
    # while this new API runs on its own port. Feature 007 will migrate
    # the frontend to the new endpoints and retire the static server.

    return app


app = create_app()
