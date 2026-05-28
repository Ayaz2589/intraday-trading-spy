import json

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
