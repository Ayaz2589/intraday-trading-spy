import argparse
import sys
from datetime import date
from pathlib import Path

from pydantic import ValidationError

from intraday_trade_spy.data.downloader import (
    Downloader,
    DownloadRequest,
    NoBarsFetchedError,
    OutputExistsError,
)


def _default_out(timeframe: str, start: date, end: date) -> Path:
    # Relative to cwd. The conventional invocation is from `backend/`, where
    # `data/raw/` is the right place. Run from elsewhere → pass --out.
    return Path("data/raw") / f"spy_{timeframe}_{start}_{end}.csv"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="intraday-trade-spy-download")
    p.add_argument("--start", required=True, type=date.fromisoformat)
    p.add_argument("--end", required=True, type=date.fromisoformat)
    p.add_argument("--timeframe", default="5m", choices=["5m", "1m"])
    p.add_argument("--out", default=None, type=Path)
    p.add_argument("--force", action="store_true")
    p.add_argument("--no-progress", action="store_true")
    args = p.parse_args(argv)

    out = args.out or _default_out(args.timeframe, args.start, args.end)
    try:
        req = DownloadRequest(
            start=args.start,
            end=args.end,
            timeframe=args.timeframe,
            out=out,
            force=args.force,
            show_progress=not args.no_progress,
        )
    except ValidationError as e:
        print(f"argument error: {e}", file=sys.stderr)
        return 2

    if req.show_progress:
        print(f"Resolved range: {req.start} -> {req.end} ({req.timeframe})")

    try:
        manifest = Downloader().fetch(req)
    except OutputExistsError as e:
        print(f"argument error: {e}", file=sys.stderr)
        return 2
    except NoBarsFetchedError as e:
        print(f"data error: {e}", file=sys.stderr)
        return 4

    print(f"Wrote {manifest.bar_count} bars to {req.out}")
    print(f"Wrote manifest to {req.out}.fetch.yaml")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
