from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import load_config


def test_engine_runs_on_fixture(default_config_path, sample_csv_path, tmp_path):
    cfg = load_config(default_config_path)
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    assert any(r.status.value == "emitted" for r in result.journal_rows)
    assert any(r.status.value == "rejected" for r in result.journal_rows)
    assert result.summary.total_trades >= 0


def test_lockout_or_max_trades_reached(default_config_path, sample_csv_path, tmp_path):
    """T057 (Phase 4 / US2): With permissive position cap so trades execute,
    the fixture produces either a daily_loss_limit_reached lockout or
    max_trades_per_day_reached rejection."""
    cfg = load_config(default_config_path)
    cfg = cfg.model_copy(
        update={
            "risk": cfg.risk.model_copy(
                update={"max_position_value_pct": 1000.0, "max_trades_per_day": 1}
            )
        }
    )
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    rejections = [r for r in result.journal_rows if r.status.value == "rejected"]
    reasons = {r.rejection_check for r in rejections}
    assert reasons & {"daily_loss_limit_reached", "max_trades_per_day_reached"}
