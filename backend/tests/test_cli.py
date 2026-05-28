import subprocess
import sys


def test_cli_end_to_end(tmp_path, default_config_path):
    out = tmp_path / "out"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "intraday_trade_spy.cli.run_backtest",
            "--config",
            str(default_config_path),
            "--out",
            str(out),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    runs = list(out.iterdir())
    assert len(runs) == 1
    assert (runs[0] / "journal.csv").exists()
    assert (runs[0] / "summary.json").exists()
    assert (runs[0] / "run.yaml").exists()
