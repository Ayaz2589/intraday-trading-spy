"""One-off seed: upload local SPY CSVs into Supabase `public.bars`.

The /data download flow is broken (download_spy is a phantom import in
api/lifecycle.py — see task #13). Until that's fixed, the bars table can be
populated from the existing local CSVs in backend/data/raw/ via this script.

Usage:
    cd backend
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
        .venv/bin/python scripts/seed_bars_from_csv.py

Reads every spy_5m_*.csv in data/raw/ and upserts each row into public.bars.
The bars table has UNIQUE (bar_start, source); duplicates are skipped.

After running, refresh the runs detail page and the chart will populate for
any run whose range_start..range_end overlaps the bars now in the table.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

from intraday_trade_spy.storage.client import SupabaseStorageClient


def _row_from_csv_line(line: dict[str, str]) -> dict:
    return {
        "bar_start": line["timestamp"],
        "open": line["open"],
        "high": line["high"],
        "low": line["low"],
        "close": line["close"],
        "volume": line["volume"],
        "source": "yfinance",
    }


def load_csv(path: Path) -> list[dict]:
    with path.open() as f:
        reader = csv.DictReader(f)
        rows = [_row_from_csv_line(line) for line in reader if line.get("symbol") == "SPY"]
    return rows


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="seed-bars-from-csv")
    p.add_argument(
        "--raw-dir",
        default="data/raw",
        help="directory containing spy_5m_*.csv files (default: data/raw)",
    )
    p.add_argument(
        "--pattern",
        default="spy_5m_*.csv",
        help="glob pattern for CSV files (default: spy_5m_*.csv)",
    )
    args = p.parse_args(argv)

    url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_role_key:
        print(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required",
            file=sys.stderr,
        )
        return 2

    raw_dir = Path(args.raw_dir)
    if not raw_dir.exists():
        print(f"raw dir not found: {raw_dir}", file=sys.stderr)
        return 2

    files = sorted(raw_dir.glob(args.pattern))
    if not files:
        print(f"no files matching {args.pattern} in {raw_dir}", file=sys.stderr)
        return 1

    # Bars are not user-scoped — the upsert ignores self.user_id. We still
    # need to pass *something* through the constructor's UUID validation.
    user_id = os.environ.get("SUPABASE_USER_ID", "00000000-0000-0000-0000-000000000000")
    client = SupabaseStorageClient(url=url, service_role_key=service_role_key, user_id=user_id)

    total = 0
    for path in files:
        if path.suffix != ".csv":
            continue
        rows = load_csv(path)
        if not rows:
            print(f"  {path.name}: empty, skipped")
            continue
        # Chunk inserts to keep Supabase happy (1000-row batches).
        inserted_here = 0
        for i in range(0, len(rows), 1000):
            chunk = rows[i : i + 1000]
            inserted_here += client.upsert_bars(chunk)
        total += inserted_here
        print(f"  {path.name}: {len(rows)} rows ({inserted_here} new)")

    print(f"\nDone. {total} new rows total.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
