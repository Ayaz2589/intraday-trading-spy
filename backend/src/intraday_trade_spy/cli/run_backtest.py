import argparse
import json
import sys
from pathlib import Path
from uuid import UUID, uuid4

from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import load_config
from intraday_trade_spy.journal.logger import JournalLogger
from intraday_trade_spy.storage.push import write_run_outputs


def _print_session_stream(rows) -> None:
    """Compact session-grouped stdout view. Groups consecutive identical
    rejections, shows trade cycles (ENTRY -> EXIT with R) prominently, and
    skips redundant 'emitted'/'approved' boilerplate."""
    # Sort by the same composite key as the on-disk journal so stdout matches
    # journal.csv chronologically (engine insertion order is causal, not
    # strictly time-sorted).
    from intraday_trade_spy.journal.exporter import STATUS_PRIORITY
    rows = sorted(
        rows,
        key=lambda e: (e.timestamp.isoformat(), STATUS_PRIORITY[e.status], e.row_seq),
    )
    current_session = None
    # Accumulator for consecutive rejections with the same rejection_check:
    # (first_ts, last_ts, reason, count).
    rej_group: tuple | None = None

    def _flush_rejection_group() -> None:
        nonlocal rej_group
        if rej_group is None:
            return
        first_ts, last_ts, reason, count = rej_group
        first = first_ts.strftime("%H:%M")
        last = last_ts.strftime("%H:%M")
        time_range = first if first == last else f"{first}–{last}"
        suffix = "" if count == 1 else f" ×{count}"
        print(f"  {time_range:13}  ✗  {reason}{suffix}")
        rej_group = None

    for r in rows:
        status = r.status.value
        ts = r.timestamp
        session = ts.date()

        if session != current_session:
            _flush_rejection_group()
            if current_session is not None:
                print()
            current_session = session
            print(f"━━━ {session} ━━━")

        # Emitted / approved rows are redundant noise (the rejection_check
        # for rejects, or the EXECUTED row for fills, is what matters). Skip
        # before flushing so they don't break a rejection group.
        if status in ("emitted", "approved"):
            continue

        if status == "rejected":
            check = r.rejection_check or "unknown"
            if rej_group is not None and rej_group[2] == check:
                rej_group = (rej_group[0], ts, check, rej_group[3] + 1)
            else:
                _flush_rejection_group()
                rej_group = (ts, ts, check, 1)
            continue

        _flush_rejection_group()
        ts_str = ts.strftime("%H:%M")
        if status == "executed":
            print(
                f"  {ts_str:13}  ►  ENTRY @ {r.actual_entry:.4f}  "
                f"qty={r.quantity}  risk=${r.planned_risk_dollars:.2f}"
            )
        elif status == "exited":
            mark = "✓" if r.exit_reason == "target" else "✗"
            print(
                f"  {ts_str:13}  {mark}  EXIT {r.exit_reason} @ {r.actual_exit:.4f}  "
                f"R={r.realized_r:+.3f}  pnl=${r.realized_pnl:+.2f}"
            )
        elif status == "force_flat":
            print(
                f"  {ts_str:13}  ~  FORCE_FLAT @ {r.actual_exit:.4f}  "
                f"R={r.realized_r:+.3f}  pnl=${r.realized_pnl:+.2f}"
            )
        elif status == "lockout":
            print(f"  {ts_str:13}  ⚠  LOCKOUT  {r.reason}")

    _flush_rejection_group()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="intraday-trade-spy-backtest")
    p.add_argument("--config", required=True)
    p.add_argument("--data", default=None)
    p.add_argument("--out", default=None)
    p.add_argument("--quiet", action="store_true")
    p.add_argument(
        "--push-to-supabase",
        action="store_true",
        help="Upload the completed run to Supabase (Feature 005). "
        "Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID env vars.",
    )
    p.add_argument(
        "--config-name",
        default="default",
        help="Operator label for the cloud config row (Feature 005). "
        "If a config with this name already exists for the user, it is reused.",
    )
    args = p.parse_args(argv)

    # Pre-flight: validate cloud-push prerequisites BEFORE running the engine,
    # so a missing env var doesn't waste a multi-minute backtest.
    supabase_client = None
    if args.push_to_supabase:
        try:
            from intraday_trade_spy.storage import (
                AuthError,
                CloudPushError,
                SupabaseStorageClient,
            )
            supabase_client = SupabaseStorageClient.from_env()
        except AuthError as e:
            print(f"--push-to-supabase: {e}", file=sys.stderr)
            return 2
        except Exception as e:
            print(f"--push-to-supabase: failed to construct client: {e}", file=sys.stderr)
            return 2

        try:
            supabase_client.health_check()
        except CloudPushError as e:
            print(f"--push-to-supabase: {e}", file=sys.stderr)
            return 3

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

    # Shared writer (storage/push.py) — same code path as the API task, so the
    # two can never drift again (Feature 014).
    run_dir = write_run_outputs(result, out_dir)

    # Cloud push happens AFTER local outputs are persisted, so a cloud failure
    # never costs the operator their local results (SC-005).
    push_status = 0
    if args.push_to_supabase:
        push_status = _push_to_supabase(
            supabase_client=supabase_client,
            run_dir=run_dir,
            config_name=args.config_name,
            cfg=cfg,
            args_config=args.config,
        )

    if not args.quiet:
        print(f"Loaded {result.run.data_fingerprint.bar_count} bars from {data_path}")
        print()
        _print_session_stream(result.journal_rows)
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
    return push_status


def _push_to_supabase(
    *,
    supabase_client,
    run_dir: Path,
    config_name: str,
    cfg,
    args_config: str,
) -> int:
    """Push the completed run to Supabase. Returns CLI exit code.

    See specs/005-supabase-data-layer/contracts/cli-flag.md for exit codes:
        0 — success
        4 — RPC failure (network, RLS, FK)
        5 — payload validation failure (Pydantic)
    """
    from pydantic import ValidationError

    from intraday_trade_spy.storage import (
        AuthError,
        CloudPushError,
        SchemaError,
    )
    from intraday_trade_spy.storage.push import config_from_yaml, gather_run_outputs

    user_id = UUID(supabase_client.user_id)
    logger = JournalLogger(supabase_client=supabase_client)
    run_uuid = uuid4()

    try:
        strategy = supabase_client.get_strategy_by_key("vwap_pullback_long")
        cloud_config = config_from_yaml(
            config_id=uuid4(),
            user_id=user_id,
            strategy_id=strategy.id,
            name=config_name,
            yaml_path=Path(args_config),
        )
        config_id_str = supabase_client.upsert_config(cloud_config)
        config_id = UUID(config_id_str)

        payload = gather_run_outputs(
            run_dir,
            user_id=user_id,
            config_id=config_id,
            strategy_id=strategy.id,
            run_uuid=run_uuid,
        )
    except ValidationError as e:
        print(f"--push-to-supabase: payload validation failed: {e}", file=sys.stderr)
        logger.log_cloud_event(
            kind="cloud_push_failure",
            user_id=user_id,
            message="Pydantic payload validation failed",
            details={"error": str(e)},
        )
        return 5
    except (SchemaError, AuthError) as e:
        print(f"--push-to-supabase: {e}", file=sys.stderr)
        logger.log_cloud_event(
            kind="cloud_push_failure",
            user_id=user_id,
            message=str(e),
        )
        return 5
    except Exception as e:
        print(f"--push-to-supabase: failed to build payload: {e}", file=sys.stderr)
        logger.log_cloud_event(
            kind="cloud_push_failure",
            user_id=user_id,
            message=str(e),
        )
        return 5

    try:
        run_id_str = supabase_client.push_run(payload)
    except CloudPushError as e:
        print(f"--push-to-supabase: push_run failed: {e}", file=sys.stderr)
        logger.log_cloud_event(
            kind="cloud_push_failure",
            user_id=user_id,
            run_id=run_uuid,
            message=str(e),
        )
        return 4

    logger.log_cloud_event(
        kind="cloud_push_success",
        user_id=user_id,
        run_id=run_uuid,
        message=f"Pushed run {run_id_str} to Supabase",
    )
    print(f"Pushed run {run_id_str} to Supabase")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
