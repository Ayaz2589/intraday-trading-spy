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
            # For rejections, surface the rejection check; for exits, surface
            # the exit reason; otherwise the signal's "why" string.
            if r.status.value == "rejected" and r.rejection_check:
                detail = r.rejection_check
            elif r.status.value in ("exited", "force_flat") and r.exit_reason:
                detail = f"{r.exit_reason} @ {r.actual_exit:.4f} (R={r.realized_r:+.3f})"
            elif r.status.value == "executed" and r.actual_entry is not None:
                detail = (
                    f"entry @ {r.actual_entry:.4f}, qty={r.quantity}, "
                    f"risk=${r.planned_risk_dollars:.2f}"
                )
            else:
                detail = r.reason
            print(f"{r.timestamp.isoformat()} {r.status.value:10} {detail}")
        s = result.summary.model_dump()
        print()
        print("=== SUMMARY ===")
        print(f"  Total trades:        {s['total_trades']}")
        print(f"  Wins / Losses:       {s['wins']} / {s['losses']}")
        print(f"  Win rate:            {s['win_rate']:.1%}")
        print(f"  Average R:           {s['average_r']:.3f}")
        print(f"  Total R:             {s['total_r']:.3f}")
        print(f"  Max drawdown:        {s['max_drawdown_r']:.3f}R")
        pf = s["profit_factor"]
        print(f"  Profit factor:       {'n/a' if pf is None else f'{pf:.3f}'}")
        print(f"  Rejected signals:    {s['rejected_signal_count']}")
        if s["rejection_breakdown"]:
            for reason, count in sorted(s["rejection_breakdown"].items()):
                print(f"    - {reason}: {count}")
        print()
        print(f"Wrote run to {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
