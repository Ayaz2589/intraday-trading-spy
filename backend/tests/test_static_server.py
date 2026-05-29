import json
import subprocess
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

# The static server tests use FastAPI's TestClient which calls socket.socket()
# for anyio's thread sync (not for real network). Mark the whole module so
# Feature 002's socket-blocker fixture lets these through.
pytestmark = pytest.mark.api


def _setup_runs_dir(monkeypatch, tmp_path):
    monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
    from intraday_trade_spy.api.static_server import app

    return TestClient(app)


def _summary_dict():
    return {
        "total_trades": 0,
        "wins": 0,
        "losses": 0,
        "win_rate": 0.0,
        "average_win_r": 0.0,
        "average_loss_r": 0.0,
        "average_r": 0.0,
        "total_r": 0.0,
        "profit_factor": None,
        "max_drawdown_r": 0.0,
        "best_trade_r": None,
        "worst_trade_r": None,
        "longest_consecutive_loss_streak": 0,
        "rejected_signal_count": 0,
        "rejection_breakdown": {},
    }


def test_app_starts_with_cors_for_localhost_5173():
    from intraday_trade_spy.api.static_server import app

    client = TestClient(app)
    resp = client.options(
        "/api/runs",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_console_script_help_runs_cleanly():
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, "-m", "intraday_trade_spy.api.static_server", "--help"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "--port" in result.stdout


def test_get_runs_returns_empty_array_when_no_runs(tmp_path, monkeypatch):
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_runs_returns_runs_newest_first(tmp_path, monkeypatch):
    for i, run_id in enumerate(
        ["20260101-100000-aaaaaaaa", "20260102-100000-bbbbbbbb"]
    ):
        d = tmp_path / run_id
        d.mkdir()
        manifest = {
            "run_id": run_id,
            "run_started_at": f"2026-01-0{i + 1}T10:00:00+00:00",
            "summary": _summary_dict(),
        }
        (d / "run.yaml").write_text(yaml.safe_dump(manifest))
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["run_id"] == "20260102-100000-bbbbbbbb"
    assert data[1]["run_id"] == "20260101-100000-aaaaaaaa"


def test_get_runs_skips_directories_without_run_yaml(tmp_path, monkeypatch):
    (tmp_path / "incomplete").mkdir()
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs")
    assert resp.json() == []


def test_get_journal_404_when_run_missing(tmp_path, monkeypatch):
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/missing-id/journal")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"] == "run_not_found"
    assert body["missing"] == "journal.csv"


def test_get_journal_returns_rows(tmp_path, monkeypatch):
    d = tmp_path / "20260101-100000-aaaaaaaa"
    d.mkdir()
    (d / "journal.csv").write_text(
        "row_seq,timestamp,status,setup,direction,planned_entry,stop_loss,take_profit,"
        "quantity,planned_risk_dollars,actual_entry,actual_exit,exit_reason,realized_pnl,"
        "realized_r,vwap,or_high,or_low,distance_from_vwap_pct,prior_bar_close,reason,"
        "rejection_check,same_bar_tiebreak\n"
        "0,2026-01-01T09:30:00-05:00,emitted,vwap_pullback_long,long,525.10,524.59,"
        "526.12,,,,,,,,524.88,525.00,523.90,0.042,525.05,Close above prior bar high,,\n"
    )
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/20260101-100000-aaaaaaaa/journal")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["row_seq"] == 0
    assert rows[0]["status"] == "emitted"
    assert rows[0]["planned_entry"] == 525.10
    assert rows[0]["quantity"] is None
    assert rows[0]["reason"] == "Close above prior bar high"


def test_get_summary_returns_json(tmp_path, monkeypatch):
    d = tmp_path / "abc"
    d.mkdir()
    (d / "summary.json").write_text(
        json.dumps({"total_trades": 4, "wins": 1, "losses": 2})
    )
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/abc/summary")
    assert resp.status_code == 200
    assert resp.json()["total_trades"] == 4


def test_get_summary_404(tmp_path, monkeypatch):
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/missing/summary")
    assert resp.status_code == 404
    assert resp.json()["error"] == "run_not_found"


def test_get_manifest_returns_yaml_as_json(tmp_path, monkeypatch):
    d = tmp_path / "abc"
    d.mkdir()
    manifest = {
        "run_id": "abc",
        "run_started_at": "2026-01-01T10:00:00+00:00",
        "code_version": "deadbeef",
        "data_fingerprint": {
            "sha256": "aaaaaaaa",
            "bar_count": 234,
            "earliest_timestamp": "2026-01-01T09:30:00-05:00",
            "latest_timestamp": "2026-01-01T15:55:00-05:00",
            "session_count": 1,
        },
        "summary": _summary_dict(),
        "config_snapshot": {},
    }
    (d / "run.yaml").write_text(yaml.safe_dump(manifest))
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/abc/manifest")
    assert resp.status_code == 200
    assert resp.json()["data_fingerprint"]["sha256"] == "aaaaaaaa"


def test_get_manifest_404(tmp_path, monkeypatch):
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/missing/manifest")
    assert resp.status_code == 404
    assert resp.json()["error"] == "run_not_found"


def test_get_bars_happy_path(tmp_path, monkeypatch):
    bars = tmp_path / "spy_bars.csv"
    bars.write_text(
        "symbol,timestamp,open,high,low,close,volume\n"
        "SPY,2026-01-01T09:30:00-05:00,525.0,525.5,524.8,525.1,1000000\n"
    )
    d = tmp_path / "abc"
    d.mkdir()
    (d / "run.yaml").write_text(
        f"run_id: abc\nconfig_snapshot:\n  data:\n    csv_path: {bars}\n"
    )
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/abc/bars")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["symbol"] == "SPY"
    assert data[0]["close"] == 525.1
    assert data[0]["volume"] == 1000000


def test_get_bars_404_when_run_missing(tmp_path, monkeypatch):
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/missing/bars")
    assert resp.status_code == 404
    assert resp.json()["error"] == "run_not_found"


def test_get_bars_404_when_source_data_missing(tmp_path, monkeypatch):
    d = tmp_path / "abc"
    d.mkdir()
    (d / "run.yaml").write_text(
        "run_id: abc\nconfig_snapshot:\n  data:\n    csv_path: /nope/missing.csv\n"
    )
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs/abc/bars")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"] == "source_data_missing"
    assert "expected_path" in body


def test_get_runs_returns_empty_when_runs_dir_does_not_exist(
    tmp_path, monkeypatch
):
    missing = tmp_path / "does_not_exist"
    client = _setup_runs_dir(monkeypatch, missing)
    resp = client.get("/api/runs")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_runs_skips_non_directory_entries(tmp_path, monkeypatch):
    (tmp_path / "stray.txt").write_text("not a run")
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.get("/api/runs")
    assert resp.json() == []


def test_get_bars_resolves_relative_csv_path(tmp_path, monkeypatch):
    """Covers the relative-path case: csv_path in the manifest is relative,
    Python resolves it against CWD (which is `backend/` under `make
    ui-server`)."""
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "spy.csv").write_text(
        "symbol,timestamp,open,high,low,close,volume\n"
        "SPY,2026-01-01T09:30:00-05:00,525,525.5,524.8,525.1,1000\n"
    )
    run_dir = tmp_path / "backtests" / "abc"
    run_dir.mkdir(parents=True)
    (run_dir / "run.yaml").write_text(
        "run_id: abc\nconfig_snapshot:\n  data:\n    csv_path: raw/spy.csv\n"
    )
    monkeypatch.setattr(
        "intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path / "backtests"
    )
    monkeypatch.chdir(tmp_path)
    from intraday_trade_spy.api.static_server import app

    resp = TestClient(app).get("/api/runs/abc/bars")
    assert resp.status_code == 200
    assert resp.json()[0]["close"] == 525.1


def test_post_run_backtest_returns_new_run_id(tmp_path, monkeypatch):
    new_run = tmp_path / "20260529-090000-deadbeef"

    def fake_run(args, **kwargs):
        new_run.mkdir()
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.post("/api/backtests/run")
    assert resp.status_code == 200
    assert resp.json()["run_id"] == "20260529-090000-deadbeef"


def test_post_run_backtest_500_on_subprocess_failure(tmp_path, monkeypatch):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 1, "", "config invalid")

    monkeypatch.setattr(subprocess, "run", fake_run)
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.post("/api/backtests/run")
    assert resp.status_code == 500
    body = resp.json()
    assert body["error"] == "backtest_failed"
    assert "config invalid" in body["stderr"]


def test_post_run_backtest_500_when_no_new_run_directory(
    tmp_path, monkeypatch
):
    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.post("/api/backtests/run")
    assert resp.status_code == 500
    assert resp.json()["error"] == "no_run_created"


def test_delete_run_removes_directory(tmp_path, monkeypatch):
    run_dir = tmp_path / "20260101-100000-abcdef00"
    run_dir.mkdir()
    (run_dir / "summary.json").write_text("{}")
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.delete("/api/runs/20260101-100000-abcdef00")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == "20260101-100000-abcdef00"
    assert not run_dir.exists()


def test_delete_run_404_when_missing(tmp_path, monkeypatch):
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.delete("/api/runs/never-existed")
    assert resp.status_code == 404
    assert resp.json()["error"] == "run_not_found"


def test_delete_all_runs_removes_every_directory(tmp_path, monkeypatch):
    for name in ["20260101-100000-aaaa", "20260102-100000-bbbb"]:
        (tmp_path / name).mkdir()
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.delete("/api/runs")
    assert resp.status_code == 200
    assert resp.json()["deleted_count"] == 2
    remaining = [d for d in tmp_path.iterdir() if d.is_dir()]
    assert remaining == []


def test_delete_all_runs_zero_when_empty(tmp_path, monkeypatch):
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.delete("/api/runs")
    assert resp.status_code == 200
    assert resp.json()["deleted_count"] == 0


def test_get_config_returns_yaml_as_json(tmp_path, monkeypatch):
    cfg = tmp_path / "config.yaml"
    cfg.write_text(
        "risk:\n  account_value: 25000.0\n  max_risk_per_trade_pct: 0.1\n"
    )
    monkeypatch.setattr(
        "intraday_trade_spy.api.static_server.CONFIG_PATH", cfg
    )
    from intraday_trade_spy.api.static_server import app

    resp = TestClient(app).get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["risk"]["account_value"] == 25000.0
    assert body["risk"]["max_risk_per_trade_pct"] == 0.1


def test_post_run_backtest_with_overrides_writes_temp_config(
    tmp_path, monkeypatch
):
    cfg = tmp_path / "config.yaml"
    cfg.write_text(
        "risk:\n  account_value: 25000.0\n  max_risk_per_trade_pct: 0.1\n"
        "  max_position_value_pct: 100.0\n"
    )
    new_run = tmp_path / "20260529-100000-abcdef"
    captured: dict = {}

    def fake_run(args, **kwargs):
        # Capture the --config path so we can verify the overrides.
        cfg_path = args[args.index("--config") + 1]
        captured["config_yaml"] = Path(cfg_path).read_text()
        new_run.mkdir()
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(
        "intraday_trade_spy.api.static_server.CONFIG_PATH", cfg
    )
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.post(
        "/api/backtests/run",
        json={
            "overrides": {
                "risk": {"max_risk_per_trade_pct": 0.5},
            }
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["run_id"] == "20260529-100000-abcdef"
    # The temp config should have the override applied AND the un-overridden
    # values preserved.
    merged = yaml.safe_load(captured["config_yaml"])
    assert merged["risk"]["max_risk_per_trade_pct"] == 0.5
    assert merged["risk"]["account_value"] == 25000.0
    assert merged["risk"]["max_position_value_pct"] == 100.0


def test_post_run_backtest_without_overrides_uses_default_config(
    tmp_path, monkeypatch
):
    new_run = tmp_path / "20260529-110000-abcdef"
    captured: dict = {}

    def fake_run(args, **kwargs):
        captured["args"] = list(args)
        new_run.mkdir()
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.post("/api/backtests/run", json={})
    assert resp.status_code == 200
    # Default invocation uses the on-disk config/config.yaml directly,
    # not a temp file.
    assert "config/config.yaml" in captured["args"]


def test_get_configs_lists_default_plus_presets(tmp_path, monkeypatch):
    cfg_dir = tmp_path / "config"
    cfg_dir.mkdir()
    (cfg_dir / "config.yaml").write_text("risk: {}\n")
    presets = cfg_dir / "presets"
    presets.mkdir()
    (presets / "low-risk.yaml").write_text("# low risk")
    (presets / "vwap50.yaml").write_text("# wider vwap")
    (presets / "README.md").write_text("# ignore me")  # not a yaml
    monkeypatch.setattr(
        "intraday_trade_spy.api.static_server.CONFIG_PATH",
        cfg_dir / "config.yaml",
    )
    monkeypatch.setattr(
        "intraday_trade_spy.api.static_server.PRESETS_DIR", presets
    )
    from intraday_trade_spy.api.static_server import app

    resp = TestClient(app).get("/api/configs")
    assert resp.status_code == 200
    body = resp.json()
    names = [c["name"] for c in body]
    assert "default" in names
    assert "low-risk" in names
    assert "vwap50" in names
    assert "README" not in names
    # default appears first.
    assert body[0]["name"] == "default"


def test_post_run_backtest_with_config_path(tmp_path, monkeypatch):
    presets = tmp_path / "presets"
    presets.mkdir()
    (presets / "low-risk.yaml").write_text("# any yaml is fine for this test")
    new_run = tmp_path / "20260529-120000-abcdef"
    captured: dict = {}

    def fake_run(args, **kwargs):
        captured["config_arg"] = args[args.index("--config") + 1]
        new_run.mkdir()
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(
        "intraday_trade_spy.api.static_server.PRESETS_DIR", presets
    )
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.post(
        "/api/backtests/run",
        json={"config_path": "config/presets/low-risk.yaml"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["run_id"] == "20260529-120000-abcdef"
    assert captured["config_arg"] == "config/presets/low-risk.yaml"


def test_post_run_backtest_rejects_config_path_traversal(tmp_path, monkeypatch):
    """The config_path must point inside config/ — block traversal so the
    endpoint can't be tricked into reading arbitrary files."""
    client = _setup_runs_dir(monkeypatch, tmp_path)
    resp = client.post(
        "/api/backtests/run",
        json={"config_path": "../../../etc/passwd"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_config_path"


def test_get_datasets_returns_empty_when_dir_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "intraday_trade_spy.api.static_server.DATA_DIR",
        tmp_path / "does-not-exist",
    )
    from intraday_trade_spy.api.static_server import app

    resp = TestClient(app).get("/api/datasets")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_datasets_parses_dates_and_sidecar(tmp_path, monkeypatch):
    data = tmp_path / "raw"
    data.mkdir()
    (data / "spy_5m_2026-04-01_2026-04-15.csv").write_text("symbol\n")
    (data / "spy_5m_2026-04-29_2026-05-28.csv").write_text("symbol\n")
    (data / "spy_5m_2026-04-29_2026-05-28.csv.fetch.yaml").write_text(
        "bar_count: 1634\nsession_count: 21\n"
    )
    (data / "spy_5m_sample.csv").write_text("symbol\n")
    (data / "README.md").write_text("# ignore me")  # not a csv
    monkeypatch.setattr(
        "intraday_trade_spy.api.static_server.DATA_DIR", data
    )
    from intraday_trade_spy.api.static_server import app

    resp = TestClient(app).get("/api/datasets")
    assert resp.status_code == 200
    body = resp.json()
    names = [d["name"] for d in body]
    # newest end date first, sample last.
    assert names == [
        "spy_5m_2026-04-29_2026-05-28",
        "spy_5m_2026-04-01_2026-04-15",
        "spy_5m_sample",
    ]
    assert body[0]["start"] == "2026-04-29"
    assert body[0]["end"] == "2026-05-28"
    assert body[0]["bar_count"] == 1634
    assert body[0]["session_count"] == 21
    # Sample has no parseable dates, no sidecar.
    assert body[2]["start"] is None
    assert body[2]["bar_count"] is None
