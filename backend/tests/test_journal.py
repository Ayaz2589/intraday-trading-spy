from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

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
