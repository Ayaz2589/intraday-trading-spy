"""T045/T049 — significance: bootstrap CI + permutation verdict (FR-013..016).

Bootstrap CIs and the permutation p-value/verdict are deterministic under a
fixed seed. The combiner is pure (the random-entry null is computed by the
caller and injected here), so it's unit-testable without bars/DB.
"""

from intraday_trade_spy.config import SignificanceConfig
from intraday_trade_spy.models import BootstrapCI, SignificanceResult
from intraday_trade_spy.validation.significance import (
    bootstrap_ci,
    compute_significance,
    permutation_p_value,
)


def test_bootstrap_ci_deterministic_and_brackets_mean():
    vals = [1.0, 2.0, 3.0, 4.0, 5.0, -1.0, 0.5, 2.5]
    a = bootstrap_ci(vals, iterations=500, confidence=0.95, seed=7)
    b = bootstrap_ci(vals, iterations=500, confidence=0.95, seed=7)
    assert a == b
    point, lo, hi = a
    assert lo is not None and hi is not None
    assert lo <= point <= hi


def test_bootstrap_ci_degenerate():
    assert bootstrap_ci([], iterations=100, confidence=0.95, seed=1) == (None, None, None)
    p, lo, hi = bootstrap_ci([3.0], iterations=100, confidence=0.95, seed=1)
    assert p == 3.0 and lo is None and hi is None


def test_permutation_p_value():
    # observed beats all null samples → p ~ 1/(N+1) small
    assert permutation_p_value(100.0, [10, 20, 30, 40]) <= 0.25
    # observed in the middle → not significant
    assert permutation_p_value(25.0, [10, 20, 30, 40]) > 0.05
    # empty null → undefined (None)
    assert permutation_p_value(1.0, []) is None


def test_compute_significance_significant_and_not():
    cfg = SignificanceConfig(bootstrap_iterations=300, permutation_iterations=30, alpha=0.05, seed=11)

    # Observed beats all 30 null samples → p = 1/31 ≈ 0.032 < 0.05 (the +1
    # smoothing means you need ≥20 null samples to ever clear α=0.05).
    sig = compute_significance(
        trade_pnls=[5, 6, 7, 8, 9, 10], trade_rs=[0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        daily_returns=[0.01, 0.012, 0.009, 0.011],
        observed_metric=1000.0, null_distribution=[float(i) for i in range(30)], cfg=cfg,
    )
    assert isinstance(sig, SignificanceResult)
    assert {c.statistic for c in sig.bootstrap} == {"expectancy_dollars", "expectancy_r", "sharpe"}
    assert sig.p_value is not None and sig.significant is True
    assert sig.seed == 11 and sig.alpha == 0.05

    not_sig = compute_significance(
        trade_pnls=[5, 6, 7], trade_rs=[0.5, 0.6, 0.7], daily_returns=[0.01, 0.01],
        observed_metric=25.0, null_distribution=[10, 20, 30, 40], cfg=cfg,
    )
    assert not_sig.significant is False


def test_compute_significance_zero_trades_undefined():
    cfg = SignificanceConfig()
    sig = compute_significance(
        trade_pnls=[], trade_rs=[], daily_returns=[],
        observed_metric=0.0, null_distribution=[], cfg=cfg,
    )
    assert sig.p_value is None and sig.significant is False


def test_extract_trade_stats():
    from intraday_trade_spy.validation.significance import extract_trade_stats

    trades = [
        {"pnl": 10.0, "r_multiple": 1.0, "entry_price": 100.0, "stop_price": 99.0,
         "quantity": 10, "entry_at": "2025-01-02T10:00:00Z"},
        {"pnl": -5.0, "r_multiple": -1.0, "entry_price": 101.0, "stop_price": 100.0,
         "quantity": 10, "entry_at": "2025-01-02T11:00:00Z"},
    ]
    s = extract_trade_stats(trades, account_value=25000.0)
    assert s["n_trades"] == 2
    assert s["observed_total"] == 5.0
    assert s["stop_distance"] == 1.0  # median of [1.0, 1.0]
    assert s["quantity"] == 10
    # Same day → one daily return = (10 - 5)/25000.
    assert s["daily_returns"] == [5.0 / 25000.0]


# --- run_significance_for_run orchestration (injected bars) ---

from datetime import datetime, time, timedelta  # noqa: E402
from zoneinfo import ZoneInfo  # noqa: E402

from intraday_trade_spy.config import load_config  # noqa: E402
from intraday_trade_spy.models import Bar  # noqa: E402

ET = ZoneInfo("America/New_York")
_CFG_PATH = __import__("pathlib").Path(__file__).resolve().parents[2] / "config" / "config.yaml"


def _bars(n=40):
    start = datetime(2025, 1, 2, 9, 30, tzinfo=ET)
    out, price = [], 100.0
    for i in range(n):
        ts = start + timedelta(minutes=5 * i)
        out.append(Bar(symbol="SPY", timestamp=ts, open=price, high=price + 0.15,
                       low=price - 0.15, close=price + 0.05, volume=1000, session_date=ts.date()))
        price += 0.05
    return out


class _FakeStorage:
    def __init__(self, trades):
        self._trades = trades

    def get_run(self, *, run_id, user_id):
        return {"range_start": "2025-01-02", "range_end": "2025-01-02"}

    def list_trades(self, *, run_id, user_id, limit, cursor):
        return SimpleNamespace(trades=self._trades, next_cursor=None)


from types import SimpleNamespace  # noqa: E402


def test_run_significance_for_run_deterministic():
    from intraday_trade_spy.api.validation_lifecycle import run_significance_for_run

    trades = [
        {"pnl": 12.0, "r_multiple": 1.0, "entry_price": 100.0, "stop_price": 99.5,
         "quantity": 10, "entry_at": "2025-01-02T10:00:00Z"},
        {"pnl": -6.0, "r_multiple": -1.0, "entry_price": 101.0, "stop_price": 100.5,
         "quantity": 10, "entry_at": "2025-01-02T11:00:00Z"},
    ]
    cfg = load_config(_CFG_PATH)
    storage = _FakeStorage(trades)
    a = run_significance_for_run(run_id="r1", user_id="u1", storage=storage, base_cfg=cfg, _bars=_bars())
    b = run_significance_for_run(run_id="r1", user_id="u1", storage=storage, base_cfg=cfg, _bars=_bars())
    assert a.model_dump() == b.model_dump()
    assert a.p_value is not None
    assert {c.statistic for c in a.bootstrap} == {"expectancy_dollars", "expectancy_r", "sharpe"}


def test_run_significance_for_run_zero_trades():
    from intraday_trade_spy.api.validation_lifecycle import run_significance_for_run

    cfg = load_config(_CFG_PATH)
    sig = run_significance_for_run(run_id="r1", user_id="u1", storage=_FakeStorage([]), base_cfg=cfg, _bars=_bars())
    assert sig.p_value is None and sig.significant is False
