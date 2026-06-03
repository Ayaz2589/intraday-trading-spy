from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from intraday_trade_spy.journal.exporter import write_journal_csv
from intraday_trade_spy.journal.logger import JournalLogger
from intraday_trade_spy.models import SignalStatus

ET = ZoneInfo("America/New_York")


def test_logger_records_emitted_row():
    log = JournalLogger()
    log.log(
        status=SignalStatus.EMITTED,
        timestamp=datetime(2026, 5, 28, 10, 15, tzinfo=ET),
        setup="vwap_pullback_long",
        reason="r",
    )
    rows = log.rows()
    assert len(rows) == 1
    assert rows[0].status == SignalStatus.EMITTED
    assert rows[0].row_seq == 0


def test_logger_assigns_sequential_row_seq():
    log = JournalLogger()
    for i in range(3):
        log.log(
            status=SignalStatus.EMITTED,
            timestamp=datetime(2026, 5, 28, 10, 0 + i, tzinfo=ET),
            setup="vwap_pullback_long",
            reason=f"r{i}",
        )
    assert [r.row_seq for r in log.rows()] == [0, 1, 2]


def test_every_row_has_snapshot_and_reason(default_config_path, sample_csv_path, tmp_path):
    from intraday_trade_spy.backtest.engine import BacktestEngine
    from intraday_trade_spy.config import load_config

    cfg = load_config(default_config_path)
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    for r in result.journal_rows:
        assert r.reason
        # Every row produced by the engine carries the snapshot; lockout rows
        # also call log.log with vwap set.
        assert r.vwap is not None or r.status.value == "lockout"
        if r.status.value == "rejected":
            assert r.rejection_check


def test_exporter_writes_deterministic_csv(tmp_path: Path):
    log = JournalLogger()
    log.log(
        status=SignalStatus.EMITTED,
        timestamp=datetime(2026, 5, 28, 10, 15, tzinfo=ET),
        setup="vwap_pullback_long",
        reason="r1",
    )
    log.log(
        status=SignalStatus.APPROVED,
        timestamp=datetime(2026, 5, 28, 10, 15, tzinfo=ET),
        setup="vwap_pullback_long",
        reason="r2",
    )
    p1 = tmp_path / "journal1.csv"
    p2 = tmp_path / "journal2.csv"
    write_journal_csv(log.rows(), p1)
    write_journal_csv(log.rows(), p2)
    content = p1.read_bytes()
    assert content.startswith(b"row_seq,timestamp,status,")
    assert b"\r\n" not in content
    assert p1.read_bytes() == p2.read_bytes()


# ---------- Feature 010 / US1 (T011a): cost detail is journaled (VII) ----------


def test_exit_rows_journal_cost_breakdown(default_config_path, sample_csv_path, tmp_path):
    """Constitution VII: an EXITED journal row carries the cost breakdown
    (gross_pnl, fees, slippage_cost) and realized_pnl == gross − fees."""
    from intraday_trade_spy.backtest.engine import BacktestEngine
    from intraday_trade_spy.config import load_config

    cfg = load_config(default_config_path)  # costs on (slippage 0.01)
    result = BacktestEngine(cfg).run(csv_path=sample_csv_path, output_dir=tmp_path)
    exits = [r for r in result.journal_rows if r.status.value in ("exited", "force_flat")]
    assert exits, "fixture should produce at least one exit"
    for r in exits:
        assert r.gross_pnl is not None
        assert r.fees is not None
        assert r.slippage_cost is not None
        assert r.realized_pnl == pytest.approx(r.gross_pnl - r.fees, abs=1e-9)
        assert r.slippage_cost > 0  # default slippage is non-zero


def test_csv_export_includes_cost_columns(default_config_path, sample_csv_path, tmp_path):
    """T011a: the CSV export surfaces the cost columns with values."""
    from intraday_trade_spy.backtest.engine import BacktestEngine
    from intraday_trade_spy.config import load_config

    cfg = load_config(default_config_path)
    result = BacktestEngine(cfg).run(csv_path=sample_csv_path, output_dir=tmp_path)
    out = tmp_path / "journal.csv"
    write_journal_csv(result.journal_rows, out)
    header = out.read_text().splitlines()[0]
    for col in ("gross_pnl", "fees", "slippage_cost"):
        assert col in header
