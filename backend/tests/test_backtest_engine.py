from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import load_config


def test_engine_runs_on_fixture(default_config_path, sample_csv_path, tmp_path):
    cfg = load_config(default_config_path)
    eng = BacktestEngine(cfg)
    result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
    assert any(r.status.value == "emitted" for r in result.journal_rows)
    assert any(r.status.value == "rejected" for r in result.journal_rows)
    assert result.summary.total_trades >= 0
