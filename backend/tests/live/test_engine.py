"""Feature 021 T015 — LiveSessionEngine decision flow (research.md R3/R4).

The live loop reuses strategy/risk/journal verbatim: completed 5m bar →
evaluate → risk.validate → bracket submit on approval; every outcome
journaled in the backtest taxonomy. Stop blocks new entries but exits keep
managing; force-flat at 15:55 cancels+closes; stale data pauses entries;
sizing uses the CONFIG account_value (spec Clarification #2), never broker
equity. All collaborators are faked — fully offline.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

ET = ZoneInfo("America/New_York")
DAY = date(2026, 6, 8)


# ---- fakes ----------------------------------------------------------------------

class FakeStorage:
    def __init__(self):
        self.events = []
        self.orders = []
        self.trades = []
        self.session = {"entries_paused": False, "pause_reason": None}
        self._seq = 0

    def append_paper_event(self, **kw):
        self._seq += 1
        self.events.append({**kw, "seq": self._seq})
        return self._seq

    def insert_paper_order(self, **kw):
        self.orders.append(kw)
        return f"po-{len(self.orders)}"

    def update_paper_order(self, **kw):
        self.orders.append({"update": kw})

    def insert_paper_trade(self, **kw):
        self.trades.append(kw)
        return f"pt-{len(self.trades)}"

    def set_paper_session_pause(self, *, session_id, paused, reason):
        self.session["entries_paused"] = paused
        self.session["pause_reason"] = reason

    def kinds(self):
        return [e["kind"] for e in self.events]


class FakeBroker:
    def __init__(self):
        self.brackets = []
        self.flattened = 0
        self.position = None

    def submit_bracket(self, *, qty, stop_loss, take_profit, client_order_id):
        self.brackets.append({
            "qty": qty, "stop_loss": stop_loss, "take_profit": take_profit,
            "client_order_id": client_order_id,
        })
        n = len(self.brackets)
        return {"broker_order_id": f"ord-{n}", "status": "accepted", "legs": [
            {"broker_order_id": f"ord-{n}-tp", "type": "limit", "status": "held"},
            {"broker_order_id": f"ord-{n}-sl", "type": "stop", "status": "held"},
        ]}

    def flatten(self):
        self.flattened += 1
        return {"broker_order_id": "ord-close", "status": "accepted"}

    def get_position(self):
        return self.position


def _config(**risk_overrides):
    from pathlib import Path

    from intraday_trade_spy.config import load_config

    cfg = load_config(Path(__file__).resolve().parents[2] / "config" / "config.yaml")
    risk = cfg.risk.model_copy(update={
        "account_value": 25_000.0,
        "max_risk_per_trade_pct": 0.1,
        "max_position_value_pct": 1200.0,
        **risk_overrides,
    })
    return cfg.model_copy(update={"risk": risk})


def _engine(cfg=None, storage=None, broker=None):
    from intraday_trade_spy.live.engine import LiveSessionEngine

    storage = storage or FakeStorage()
    broker = broker or FakeBroker()
    eng = LiveSessionEngine(
        cfg=cfg or _config(),
        session_id="ps-1",
        storage=storage,
        broker=broker,
    )
    return eng, storage, broker


def _bar(hh, mm, *, o=525.0, h=525.6, lo=524.8, c=525.4, v=1000, day=DAY):
    from intraday_trade_spy.models import Bar

    return Bar(symbol="SPY",
               timestamp=datetime(day.year, day.month, day.day, hh, mm, tzinfo=ET),
               open=o, high=h, low=lo, close=c, volume=v, session_date=day)


def _walk_to_signal(eng):
    """Feed bars that complete the OR then print a textbook pullback signal:
    close above VWAP, within distance, above prior close."""
    eng.on_five_minute_bar(_bar(9, 30, o=525, h=525.5, lo=524.7, c=524.9))
    eng.on_five_minute_bar(_bar(9, 35, o=524.9, h=525.2, lo=524.6, c=524.8))
    eng.on_five_minute_bar(_bar(9, 40, o=524.8, h=525.1, lo=524.5, c=524.9))
    # OR complete (15m); this bar closes above vwap and above prior close
    eng.on_five_minute_bar(_bar(9, 45, o=524.9, h=525.9, lo=524.8, c=525.8))


# ---- entries --------------------------------------------------------------------

def test_qualifying_bar_emits_approves_and_submits_bracket():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    kinds = storage.kinds()
    assert "emitted" in kinds and "approved" in kinds
    assert len(broker.brackets) == 1
    b = broker.brackets[0]
    assert b["stop_loss"] < 525.8 < b["take_profit"]
    # the entry + legs were recorded as paper_orders
    legs = [o for o in storage.orders if o.get("leg")]
    assert {o["leg"] for o in legs} == {"entry", "take_profit", "stop_loss"}


def test_sizing_uses_config_account_value_not_broker_equity():
    """Spec Clarification #2: qty must derive from cfg.risk.account_value."""
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    # position_size = floor(25_000 * 0.1% / risk_per_share)
    from intraday_trade_spy.risk.sizing import position_size

    bar_close, bar_low = 525.8, 524.8
    stop = bar_low * (1 - 0.05 / 100)
    expected = position_size(
        account=25_000.0, risk_pct=0.1, entry=bar_close, stop=stop,
    )
    assert qty == expected and qty > 0


def test_risk_rejection_is_journaled_and_no_order_submitted():
    eng, storage, broker = _engine(cfg=_config(max_position_value_pct=0.0001))
    _walk_to_signal(eng)
    assert "rejected" in storage.kinds()
    assert broker.brackets == []
    rej = [e for e in storage.events if e["kind"] == "rejected"][0]
    assert rej["payload"]["rejection_check"]


def test_no_entry_after_cutoff():
    eng, storage, broker = _engine()
    # walk the OR in the morning, then a perfect setup at 15:35 (> 15:30)
    eng.on_five_minute_bar(_bar(9, 30, c=524.9))
    eng.on_five_minute_bar(_bar(9, 35, c=524.8))
    eng.on_five_minute_bar(_bar(9, 40, c=524.9))
    eng.on_five_minute_bar(_bar(15, 35, o=524.9, h=525.9, lo=524.8, c=525.8))
    assert broker.brackets == []
    assert "rejected" in storage.kinds()


def test_stop_blocks_new_entries_but_position_keeps_managing():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": broker.brackets[0]["qty"],
                         "filled_avg_price": 525.85,
                         "timestamp": _bar(9, 50).timestamp})
    eng.request_stop(reason="operator")
    # a later perfect setup must NOT enter
    eng.on_five_minute_bar(_bar(10, 0, o=525.9, h=526.4, lo=525.8, c=526.3))
    assert len(broker.brackets) == 1
    # but the open position's exit still lands when the stop leg fills
    eng.on_order_update({"broker_order_id": "ord-1-sl", "leg": "stop_loss",
                         "status": "filled", "filled_qty": broker.brackets[0]["qty"],
                         "filled_avg_price": 524.50,
                         "timestamp": _bar(10, 5).timestamp})
    assert len(storage.trades) == 1
    assert storage.trades[0]["exit_reason"] == "stop"


# ---- exits ----------------------------------------------------------------------

def test_target_fill_records_trade_with_backtest_r_definition():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    stop = broker.brackets[0]["stop_loss"]
    target = broker.brackets[0]["take_profit"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    eng.on_order_update({"broker_order_id": "ord-1-tp", "leg": "take_profit",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": target,
                         "timestamp": _bar(11, 0).timestamp})
    t = storage.trades[0]
    assert t["exit_reason"] == "target"
    expected_r = (target - 525.80) / (525.80 - stop)
    assert t["realized_r"] == pytest.approx(expected_r, rel=1e-9)
    assert t["gross_pnl"] == pytest.approx((target - 525.80) * qty, rel=1e-9)
    assert "exited" in storage.kinds()


def test_loss_starts_cooldown_and_consecutive_losses_lockout_path():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    eng.on_order_update({"broker_order_id": "ord-1-sl", "leg": "stop_loss",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 524.50,
                         "timestamp": _bar(9, 55).timestamp})
    # cooldown: an immediate new setup is rejected with cooldown reason
    eng.on_five_minute_bar(_bar(10, 0, o=525.9, h=526.4, lo=525.8, c=526.3))
    rej = [e for e in storage.events if e["kind"] == "rejected"]
    assert any("cooldown" in (e["payload"].get("rejection_check") or "") for e in rej)


# ---- force-flat -----------------------------------------------------------------

def test_force_flat_time_cancels_and_closes():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    eng.on_tick(datetime(2026, 6, 8, 15, 55, tzinfo=ET))
    assert broker.flattened == 1
    # the close fill completes the trade as force_flat
    eng.on_order_update({"broker_order_id": "ord-close", "leg": "close",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.10,
                         "timestamp": datetime(2026, 6, 8, 15, 55, tzinfo=ET)})
    assert storage.trades[0]["exit_reason"] == "force_flat"
    assert "force_flat" in storage.kinds()


def test_force_flat_with_partial_fill_cancels_remainder():
    """Spec edge case: unfilled remainder cancelled, filled portion flattened."""
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "partially_filled", "filled_qty": max(1, qty // 2),
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    eng.on_tick(datetime(2026, 6, 8, 15, 55, tzinfo=ET))
    assert broker.flattened == 1  # flatten cancels open orders THEN closes


def test_force_flat_only_fires_once():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    eng.on_tick(datetime(2026, 6, 8, 15, 55, tzinfo=ET))
    eng.on_tick(datetime(2026, 6, 8, 15, 56, tzinfo=ET))
    assert broker.flattened == 1


# ---- safety ---------------------------------------------------------------------

def test_stale_data_pauses_entries_and_resumes_on_fresh_bar():
    eng, storage, broker = _engine()
    eng.on_five_minute_bar(_bar(9, 30, c=524.9))
    # 10 minutes pass with no data, well past stale_data_seconds=120
    eng.on_tick(datetime(2026, 6, 8, 9, 45, tzinfo=ET))
    assert "safety_pause" in storage.kinds()
    assert storage.session["entries_paused"] is True
    # entries are blocked while paused
    eng.on_five_minute_bar(_bar(9, 50, o=524.9, h=525.9, lo=524.8, c=525.8))
    assert broker.brackets == []
    assert "safety_resume" in storage.kinds()  # fresh bar resumes


def test_day_roll_resets_daily_counters_and_journals():
    eng, storage, broker = _engine()
    eng.on_five_minute_bar(_bar(9, 30, c=524.9, day=DAY))
    eng.on_five_minute_bar(_bar(9, 30, c=524.9, day=date(2026, 6, 9)))
    assert "day_rolled" in storage.kinds()


def test_window_skip_is_journaled_and_never_trades():
    cfg = _config()
    vp = cfg.strategy.vwap_pullback
    vp2 = vp.model_copy(update={
        "entry_window": vp.entry_window.model_copy(
            update={"start_minutes_after_open": 60}),
    })
    cfg2 = cfg.model_copy(update={
        "strategy": cfg.strategy.model_copy(update={"vwap_pullback": vp2}),
    })
    eng, storage, broker = _engine(cfg=cfg2)
    _walk_to_signal(eng)  # valid setup at minute 15 — outside [60, 390)
    assert "skipped_window" in storage.kinds()
    assert broker.brackets == []


def test_order_update_without_leg_resolves_from_known_ids():
    """Real TradingStream events carry only the broker order id — the engine
    must map it to entry/take_profit/stop_loss itself."""
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "status": "filled",
                         "filled_qty": qty, "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    eng.on_order_update({"broker_order_id": "ord-1-tp", "status": "filled",
                         "filled_qty": qty, "filled_avg_price": 528.00,
                         "timestamp": _bar(11, 0).timestamp})
    assert len(storage.trades) == 1
    assert storage.trades[0]["exit_reason"] == "target"


# ---- reconcile (FR-016) -----------------------------------------------------------

def test_reconcile_mismatch_pauses_entries_until_acknowledged():
    eng, storage, broker = _engine()
    eng.on_five_minute_bar(_bar(9, 30, c=524.9))
    # engine believes it's flat, but the broker reports a position — drift
    broker.position = {"qty": 5, "avg_entry": 525.0, "unrealized_pnl": 0.0}
    eng.reconcile(datetime(2026, 6, 8, 9, 33, tzinfo=ET))
    assert "reconcile_mismatch" in storage.kinds()
    assert storage.session["entries_paused"] is True
    assert storage.session["pause_reason"] == "reconcile_mismatch"
    # entries blocked while mismatched
    eng.on_five_minute_bar(_bar(9, 35, c=524.8))
    eng.on_five_minute_bar(_bar(9, 40, c=524.9))
    eng.on_five_minute_bar(_bar(9, 45, o=524.9, h=525.9, lo=524.8, c=525.8))
    assert broker.brackets == []
    # a fresh bar does NOT auto-resume a reconcile pause (operator must ack)
    assert storage.session["entries_paused"] is True
    eng.acknowledge_reconcile(datetime(2026, 6, 8, 9, 50, tzinfo=ET))
    assert "reconcile_ack" in storage.kinds()
    assert storage.session["entries_paused"] is False


def test_reconcile_matching_state_does_not_pause():
    eng, storage, broker = _engine()
    eng.on_five_minute_bar(_bar(9, 30, c=524.9))
    broker.position = None  # both flat — no drift
    eng.reconcile(datetime(2026, 6, 8, 9, 33, tzinfo=ET))
    assert "reconcile_mismatch" not in storage.kinds()


# ---- manual orders (US4) ----------------------------------------------------------

def test_manual_order_goes_through_the_risk_manager_and_brackets():
    eng, storage, broker = _engine()
    eng.on_five_minute_bar(_bar(9, 30, c=524.9))  # establish day/state
    out = eng.submit_manual(
        stop_loss=524.0, take_profit=527.0, price=525.0,
        now=datetime(2026, 6, 8, 10, 0, tzinfo=ET),
    )
    assert out["approved"] is True
    assert len(broker.brackets) == 1
    assert broker.brackets[0]["stop_loss"] == 524.0
    legs = [o for o in storage.orders if o.get("leg")]
    assert all(o["origin"] == "manual" for o in legs)
    kinds = storage.kinds()
    assert "emitted" in kinds and "approved" in kinds


def test_manual_order_rejected_when_position_open():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    out = eng.submit_manual(
        stop_loss=524.0, take_profit=527.0, price=525.0,
        now=datetime(2026, 6, 8, 10, 0, tzinfo=ET),
    )
    assert out["approved"] is False
    assert "position" in out["reason"]
    assert len(broker.brackets) == 1  # no second bracket
    assert "rejected" in storage.kinds()


def test_manual_close_flattens_and_marks_exit_reason_manual():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    eng.close_manual(now=datetime(2026, 6, 8, 11, 0, tzinfo=ET))
    assert broker.flattened == 1
    eng.on_order_update({"broker_order_id": "ord-close", "leg": "close",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 526.00,
                         "timestamp": datetime(2026, 6, 8, 11, 0, tzinfo=ET)})
    assert storage.trades[0]["exit_reason"] == "manual"


# ---- pre-open guard (Feature 023 US1) -------------------------------------------

_PRE_OPEN = [(9, 0), (9, 5), (9, 10), (9, 15), (9, 20), (9, 25)]
_SIGNAL_KINDS = {"emitted", "approved", "rejected", "executed", "exited",
                 "force_flat", "lockout", "skipped_window"}


def test_preopen_bars_are_dropped_no_state_no_trades():
    """T003 — a bar before clock.session_start never enters the session frame
    and never triggers any signal-taxonomy event or order. (FR-002)"""
    eng, storage, broker = _engine()
    for hh, mm in _PRE_OPEN:
        eng.on_five_minute_bar(_bar(hh, mm))
    assert eng.session_state.bar_count == 0
    assert broker.brackets == []
    assert not (set(storage.kinds()) & _SIGNAL_KINDS)


def test_preopen_journals_one_pre_open_event_per_bar():
    """T005 — pre-open data activity is recorded (one event per bar). (FR-005)"""
    eng, storage, _ = _engine()
    for hh, mm in _PRE_OPEN:
        eng.on_five_minute_bar(_bar(hh, mm))
    assert storage.kinds().count("pre_open") == len(_PRE_OPEN)


def test_preopen_bars_do_not_corrupt_vwap_or_for_rth_bars():
    """T004 / SC-002 — VWAP & opening range for RTH bars are identical whether
    or not (wildly different) pre-open bars were received earlier. (FR-003/004)"""
    eng_a, storage_a, _ = _engine()
    for hh, mm in _PRE_OPEN:  # extreme prices: would wreck VWAP/OR if leaked
        eng_a.on_five_minute_bar(_bar(hh, mm, o=600, h=601, lo=599, c=600.5, v=9999))
    _walk_to_signal(eng_a)

    eng_b, storage_b, _ = _engine()
    _walk_to_signal(eng_b)

    emit_a = next(e for e in storage_a.events if e["kind"] == "emitted")
    emit_b = next(e for e in storage_b.events if e["kind"] == "emitted")
    for key in ("vwap", "or_high", "or_low", "distance_from_vwap_pct"):
        assert emit_a["payload"][key] == emit_b["payload"][key], key


# ---- staleness measured by arrival, not 5m bucket timestamp (Feature 024) -------

def test_record_data_keeps_session_fresh_between_5m_bars():
    """A 5m bar is stamped at its bucket START (up to 5 min old). As long as
    1m bars keep arriving (record_data), the stale pause must NOT trip."""
    eng, storage, broker = _engine()
    eng.on_five_minute_bar(_bar(9, 30, c=524.9))      # stamped 09:30
    eng.record_data(datetime(2026, 6, 8, 9, 33, tzinfo=ET))   # 1m bar arrived 09:33
    eng.on_tick(datetime(2026, 6, 8, 9, 34, tzinfo=ET))       # 60s since arrival
    assert "safety_pause" not in storage.kinds()
    assert storage.session["entries_paused"] is False


def test_stale_pause_still_fires_when_arrivals_actually_stop():
    """If no data arrives for > stale_data_seconds, the pause still fires."""
    eng, storage, broker = _engine()
    eng.on_five_minute_bar(_bar(9, 30, c=524.9))
    eng.record_data(datetime(2026, 6, 8, 9, 30, tzinfo=ET))
    eng.on_tick(datetime(2026, 6, 8, 9, 45, tzinfo=ET))       # 15 min, no arrivals
    assert "safety_pause" in storage.kinds()
