#!/usr/bin/env python
"""Feature 009 — bulk historical SPY bar backfill CLI.

Loads multi-year SPY 5-minute bars from a bar source (default: Alpaca, feed
from config.yaml) into the shared Supabase `bars` cache via PostgREST upsert
(ON CONFLICT DO NOTHING — idempotent/resumable). Mirrors the in-app backfill
runner; use this for the big one-time load you can watch from a terminal.

    python scripts/backfill_bars.py --start 2018-01-01 --end 2026-06-02

Env: ALPACA_API_KEY, ALPACA_SECRET_KEY, SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID (loaded from backend/.env).
"""

from __future__ import annotations

import argparse
import os
import pathlib
from datetime import date


def load_env(path: str = ".env") -> None:
    """Best-effort load of KEY=VALUE lines from .env into os.environ."""
    p = pathlib.Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def run_backfill(
    *, storage_client, bar_source, start: date, end: date, window_days: int, log=print
) -> dict:
    """Loop fetch windows, upsert each (idempotent), report counts + gaps."""
    from intraday_trade_spy.data.downloader import iter_windows

    windows = iter_windows(start, end, max_days=window_days)
    bars_added = 0
    gaps: list[str] = []
    for i, (ws, we) in enumerate(windows, start=1):
        rows = bar_source.fetch_rows(start=ws, end=we, symbol="SPY", timeframe="5m")
        if not rows:
            gaps.append(f"{ws}..{we}")
        else:
            for j in range(0, len(rows), 1000):
                bars_added += storage_client.upsert_bars(rows[j : j + 1000])
        log(f"[{i}/{len(windows)}] {ws} -> {we}: fetched {len(rows)}, total added {bars_added}")
    return {"bars_added": bars_added, "windows": len(windows), "gaps": gaps}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Bulk-backfill SPY bars into the Supabase cache (Feature 009)."
    )
    ap.add_argument("--start", required=True, help="YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD (inclusive)")
    ap.add_argument("--source", default="alpaca", choices=["alpaca", "yfinance"])
    ap.add_argument(
        "--window-days", type=int, default=365, help="Fetch-window size (calendar days)."
    )
    args = ap.parse_args(argv)

    load_env()
    from intraday_trade_spy.config import load_config
    from intraday_trade_spy.storage import SupabaseStorageClient

    cfg = load_config("config/config.yaml")
    if args.source == "alpaca":
        from intraday_trade_spy.data.alpaca_source import AlpacaBarSource

        src = AlpacaBarSource(feed=cfg.alpaca.feed)
        print(f"Source: Alpaca (feed={cfg.alpaca.feed})")
    else:
        from intraday_trade_spy.data.bar_source import YfinanceBarSource

        src = YfinanceBarSource()
        print("Source: yfinance")

    storage = SupabaseStorageClient.from_env()
    result = run_backfill(
        storage_client=storage,
        bar_source=src,
        start=date.fromisoformat(args.start),
        end=date.fromisoformat(args.end),
        window_days=args.window_days,
        log=print,
    )
    print(
        f"DONE: {result['bars_added']} bars added across {result['windows']} windows; "
        f"{len(result['gaps'])} empty windows"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
