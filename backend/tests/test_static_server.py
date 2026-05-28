import pytest
from fastapi.testclient import TestClient

# The static server tests use FastAPI's TestClient which calls socket.socket()
# for anyio's thread sync (not for real network). Mark the whole module so
# Feature 002's socket-blocker fixture lets these through.
pytestmark = pytest.mark.api


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
    """T138b — CLI argparse smoke test (M3 fix)."""
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, "-m", "intraday_trade_spy.api.static_server", "--help"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "--port" in result.stdout
