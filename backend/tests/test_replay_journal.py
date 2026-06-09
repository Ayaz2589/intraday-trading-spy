"""Feature 022 (T004) — ReplayJournal: append-only, PaperEvent-shaped."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from intraday_trade_spy.replay.journal import ReplayJournal

ET = ZoneInfo("America/New_York")


def _ts(h, m):
    return datetime(2026, 5, 26, h, m, tzinfo=ET)


def test_seq_is_monotonic_from_one():
    j = ReplayJournal()
    s1 = j.emit("emitted", timestamp=_ts(9, 35), trading_day=date(2026, 5, 26))
    s2 = j.emit("approved", timestamp=_ts(9, 35), trading_day=date(2026, 5, 26))
    assert (s1, s2) == (1, 2)
    assert j.last_seq == 2


def test_event_shape_matches_paper_event():
    j = ReplayJournal()
    j.emit("executed", timestamp=_ts(9, 40), trading_day=date(2026, 5, 26),
           qty=10, entry_price=525.1, reason="x")
    e = j.events()[0]
    assert set(e) == {"seq", "trading_day", "timestamp", "kind", "payload"}
    assert e["kind"] == "executed"
    assert e["trading_day"] == "2026-05-26"
    assert e["payload"]["qty"] == 10
    assert e["payload"]["reason"] == "x"


def test_since_seq_filtering():
    j = ReplayJournal()
    for k in ("a", "b", "c"):
        j.emit(k, timestamp=_ts(9, 35), trading_day=date(2026, 5, 26))
    assert [e["kind"] for e in j.events(since_seq=1)] == ["b", "c"]
    assert j.events(since_seq=3) == []
