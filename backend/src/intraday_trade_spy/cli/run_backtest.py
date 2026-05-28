import argparse
import json
import sys
from pathlib import Path

from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.backtest.manifest import write_run_yaml
from intraday_trade_spy.config import load_config
from intraday_trade_spy.journal.exporter import write_journal_csv


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="intraday-trade-spy-backtest")
    p.add_argument("--config", required=True)
    p.add_argument("--data", default=None)
    p.add_argument("--out", default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        cfg = load_config(args.config)
    except Exception as e:
        print(f"config error: {e}", file=sys.stderr)
        return 2

    data_path = Path(args.data or cfg.data.csv_path)
    out_dir = Path(args.out or cfg.data.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    engine = BacktestEngine(cfg)
    result = engine.run(csv_path=data_path, output_dir=out_dir)

    run_dir = out_dir / result.run.run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    write_journal_csv(result.journal_rows, run_dir / "journal.csv")
    (run_dir / "summary.json").write_text(
        json.dumps(result.summary.model_dump(), indent=2, sort_keys=True, ensure_ascii=False)
        + "\n"
    )
    write_run_yaml(result.run, run_dir / "run.yaml")

    if not args.quiet:
        print(f"Loaded {result.run.data_fingerprint.bar_count} bars from {data_path}")
        for r in result.journal_rows:
            print(f"{r.timestamp.isoformat()} {r.status.value:10} {r.reason}")
        print("=== SUMMARY ===")
        print(json.dumps(result.summary.model_dump(), indent=2, sort_keys=True))
        print(f"Wrote run to {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
