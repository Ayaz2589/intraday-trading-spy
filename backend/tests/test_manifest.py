from datetime import datetime, timezone

from intraday_trade_spy.backtest.manifest import build_run
from intraday_trade_spy.backtest.metrics import compute_summary
from intraday_trade_spy.config import load_config


def test_manifest_has_required_fields(default_config_path, sample_csv_path):
    cfg = load_config(default_config_path)
    run = build_run(
        csv_path=sample_csv_path,
        cfg=cfg,
        summary=compute_summary([]),
        started=datetime.now(timezone.utc),
        ended=datetime.now(timezone.utc),
    )
    assert len(run.data_fingerprint.sha256) == 64
    assert run.code_version
    assert run.run_id
