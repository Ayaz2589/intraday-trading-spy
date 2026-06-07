"""Feature 021 T011 — live journal writer (constitution VII; data-model
paper_events). Signal events use the backtest JournalEntry vocabulary;
lifecycle events carry the live loop's own kinds. Append-only via storage."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
TS = datetime(2026, 6, 8, 10, 0, tzinfo=ET)
DAY = date(2026, 6, 8)


class FakeStorage:
    def __init__(self):
        self.events = []
        self._seq = 0

    def append_paper_event(self, *, session_id, trading_day, timestamp, kind, payload):
        self._seq += 1
        self.events.append({
            "session_id": session_id, "trading_day": trading_day,
            "timestamp": timestamp, "kind": kind, "payload": payload,
            "seq": self._seq,
        })
        return self._seq


def _journal(storage=None):
    from intraday_trade_spy.live.journal import LiveJournal

    return LiveJournal(storage or FakeStorage(), session_id="ps-1")


def test_signal_event_uses_journal_entry_vocabulary():
    s = FakeStorage()
    j = _journal(s)
    seq = j.signal(
        "rejected", timestamp=TS, trading_day=DAY,
        reason="Position Value Exceeds Cap",
        rejection_check="position_value_exceeds_cap",
        planned_entry=525.1, stop_loss=524.2, take_profit=526.9,
        vwap=524.9, distance_from_vwap_pct=0.04,
    )
    assert seq == 1
    ev = s.events[0]
    assert ev["kind"] == "rejected"
    assert ev["payload"]["rejection_check"] == "position_value_exceeds_cap"
    assert ev["payload"]["planned_entry"] == 525.1
    assert ev["session_id"] == "ps-1"


def test_signal_event_refuses_unknown_status():
    import pytest

    j = _journal()
    with pytest.raises(ValueError):
        j.signal("totally_made_up", timestamp=TS, trading_day=DAY)


def test_lifecycle_event_kinds_pass_through():
    s = FakeStorage()
    j = _journal(s)
    j.lifecycle("session_started", timestamp=TS, trading_day=DAY,
                config_name="default")
    j.lifecycle("data_gap", timestamp=TS, trading_day=DAY, gap_seconds=180)
    assert [e["kind"] for e in s.events] == ["session_started", "data_gap"]
    assert s.events[1]["payload"]["gap_seconds"] == 180


def test_lifecycle_refuses_unknown_kind():
    import pytest

    j = _journal()
    with pytest.raises(ValueError):
        j.lifecycle("nonsense_kind", timestamp=TS, trading_day=DAY)


def test_none_fields_are_dropped_from_payload():
    s = FakeStorage()
    j = _journal(s)
    j.signal("emitted", timestamp=TS, trading_day=DAY,
             planned_entry=525.1, stop_loss=None)
    assert "stop_loss" not in s.events[0]["payload"]
