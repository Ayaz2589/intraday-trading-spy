"""T058 (Phase 5 / US3): changing a single config knob produces a
deterministic, visible change in the journal."""
from pathlib import Path

import pytest
import yaml

from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import Config


def _journal_signature(journal_rows):
    """Compact representation of the journal — enough to differ when a knob changes."""
    return [
        (r.timestamp.isoformat(), r.status.value, r.rejection_check or "", r.reason)
        for r in journal_rows
    ]


def _run(cfg: Config, csv_path, out_dir) -> list[tuple]:
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=csv_path, output_dir=out_dir)
    return _journal_signature(result.journal_rows)


# Knobs chosen so each produces a visible diff against the bundled fixture
# WITHOUT requiring trades to execute (default config's $250 cap blocks
# executions on realistic SPY prices). Each knob shifts emit/reject patterns.
CHANGES = [
    ("strategy.opening_range.minutes", 30),  # later OR completion → fewer emits
    ("strategy.vwap_pullback.max_distance_from_vwap_pct", 0.10),  # tighter
    ("market.no_new_trades_after", "11:00:00"),  # earlier cutoff → more no_new_trades rejections
]


@pytest.mark.parametrize("dotted,value", CHANGES)
def test_config_knob_changes_journal(default_config_path, sample_csv_path, tmp_path, dotted, value):
    raw = yaml.safe_load(Path(default_config_path).read_text())
    base = Config.model_validate(raw)

    d = raw
    parts = dotted.split(".")
    for p in parts[:-1]:
        d = d[p]
    d[parts[-1]] = value
    modified = Config.model_validate(raw)

    base_sig = _run(base, sample_csv_path, tmp_path / "base")
    mod_sig = _run(modified, sample_csv_path, tmp_path / "mod")
    assert base_sig != mod_sig, f"changing {dotted} did not change the journal"
