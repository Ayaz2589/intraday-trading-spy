"""Feature 010 / US1 — SC-002: a known fixture proves costs are applied.

Reuses the golden fixture (tests/fixtures/spy_5m_sample.csv): 3 trades, each
qty 44. With default config (fees 0, slippage 0.01) total slippage cost is
0.01 × 44 × 2 × 3 = 2.64. See fixtures/cost_fixture_expected.md.
"""

import pytest

from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import load_config

EXPECTED_TOTAL_SLIPPAGE = 0.01 * 44 * 2 * 3  # 2.64


def _summary(cfg, csv, out):
    return BacktestEngine(cfg).run(csv_path=csv, output_dir=out).summary


def _legacy_default(cfg):
    """Feature 012 raised the default position-value cap (100->400); this golden
    cost fixture (qty 44) was authored at cap=100. Pin it so the exact-cost
    assertion stays a stable engine-logic check, independent of the default."""
    return cfg.model_copy(
        update={"risk": cfg.risk.model_copy(update={"max_position_value_pct": 100.0})}
    )


def test_cost_fixture_reports_exact_modeled_cost(default_config_path, sample_csv_path, tmp_path):
    cfg = _legacy_default(load_config(default_config_path))
    s = _summary(cfg, sample_csv_path, tmp_path)
    assert s.total_trades == 3
    assert s.total_fees_dollars == pytest.approx(0.0, abs=1e-12)
    assert s.total_slippage_dollars == pytest.approx(EXPECTED_TOTAL_SLIPPAGE, abs=1e-9)


def test_cost_fixture_total_pnl_is_net(default_config_path, sample_csv_path, tmp_path):
    cfg = _legacy_default(load_config(default_config_path))
    s = _summary(cfg, sample_csv_path, tmp_path)
    # total_pnl_dollars is the canonical net figure; the explicit alias agrees.
    assert s.total_net_pnl_dollars == pytest.approx(s.total_pnl_dollars, abs=1e-9)
