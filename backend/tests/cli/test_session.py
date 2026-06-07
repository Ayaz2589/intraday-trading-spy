"""Feature 019 T006 — CLI operator session (contracts/cli-auth.md).

The CLI is a public client: email-OTP login via GoTrue REST with the anon
key, session persisted 0600, rotating refresh, one 401 retry, and NEVER the
service-role key.
"""

import json
import time

import httpx
import pytest

from intraday_trade_spy.cli import session as session_mod


ANON = "anon-key-123"
URL = "https://example.supabase.co"


@pytest.fixture
def session_file(tmp_path, monkeypatch):
    path = tmp_path / "session.json"
    monkeypatch.setenv("ITS_SESSION_FILE", str(path))
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setenv("SUPABASE_ANON_KEY", ANON)
    return path


def _gotrue_transport(calls):
    """MockTransport playing GoTrue: /otp accepts, /verify and /token return
    rotated token pairs."""

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.path.endswith("/auth/v1/otp"):
            assert request.headers["apikey"] == ANON
            body = json.loads(request.content)
            assert body["create_user"] is False  # login never provisions
            return httpx.Response(200, json={})
        if request.url.path.endswith("/auth/v1/verify"):
            return httpx.Response(200, json={
                "access_token": "access-1", "refresh_token": "refresh-1",
                "expires_in": 3600, "user": {"id": "u-1", "email": "op@x.com"},
            })
        if request.url.path.endswith("/auth/v1/token"):
            body = json.loads(request.content)
            n = int(body["refresh_token"].split("-")[1]) + 1
            return httpx.Response(200, json={
                "access_token": f"access-{n}", "refresh_token": f"refresh-{n}",
                "expires_in": 3600,
            })
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def _write_session(path, *, expires_in=3600, n=1):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "supabase_url": URL, "email": "op@x.com",
        "access_token": f"access-{n}", "refresh_token": f"refresh-{n}",
        "expires_at": time.time() + expires_in,
    }))
    path.chmod(0o600)


def test_login_writes_session_file_with_0600(session_file, capsys):
    calls = []
    session_mod.login(
        email="op@x.com",
        input_fn=lambda prompt="": "123456",
        transport=_gotrue_transport(calls),
    )
    assert session_file.exists()
    assert (session_file.stat().st_mode & 0o777) == 0o600
    saved = json.loads(session_file.read_text())
    assert saved["access_token"] == "access-1"
    assert saved["refresh_token"] == "refresh-1"
    assert saved["email"] == "op@x.com"
    assert saved["expires_at"] > time.time()
    # otp then verify, in order
    assert [c.url.path.split("/")[-1] for c in calls] == ["otp", "verify"]
    # tokens never printed (cli-auth invariant)
    out = capsys.readouterr()
    assert "access-1" not in out.out + out.err
    assert "refresh-1" not in out.out + out.err


def test_authed_request_sends_bearer(session_file):
    _write_session(session_file)
    seen = []

    def api_handler(request):
        seen.append(request)
        return httpx.Response(200, json={"ok": True})

    resp = session_mod.authed_request(
        "GET", "/api/healthz", api_url="http://api",
        api_transport=httpx.MockTransport(api_handler),
        gotrue_transport=_gotrue_transport([]),
    )
    assert resp.status_code == 200
    assert seen[0].headers["authorization"] == "Bearer access-1"


def test_near_expiry_refresh_rotates_both_tokens(session_file):
    _write_session(session_file, expires_in=10)  # < 60s window
    session_mod.authed_request(
        "GET", "/api/healthz", api_url="http://api",
        api_transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})),
        gotrue_transport=_gotrue_transport([]),
    )
    saved = json.loads(session_file.read_text())
    assert saved["access_token"] == "access-2"
    assert saved["refresh_token"] == "refresh-2"  # BOTH rotated atomically
    assert (session_file.stat().st_mode & 0o777) == 0o600


def test_401_triggers_one_refresh_and_retry(session_file):
    _write_session(session_file)
    attempts = []

    def api_handler(request):
        attempts.append(request.headers["authorization"])
        if len(attempts) == 1:
            return httpx.Response(401, json={"detail": {"error": "missing_or_invalid_token"}})
        return httpx.Response(200, json={"ok": True})

    resp = session_mod.authed_request(
        "GET", "/api/runs", api_url="http://api",
        api_transport=httpx.MockTransport(api_handler),
        gotrue_transport=_gotrue_transport([]),
    )
    assert resp.status_code == 200
    assert attempts == ["Bearer access-1", "Bearer access-2"]


def test_persistent_401_raises_not_signed_in(session_file):
    _write_session(session_file)
    resp_401 = lambda r: httpx.Response(401, json={})  # noqa: E731
    with pytest.raises(session_mod.NotSignedIn) as exc:
        session_mod.authed_request(
            "GET", "/api/runs", api_url="http://api",
            api_transport=httpx.MockTransport(resp_401),
            gotrue_transport=_gotrue_transport([]),
        )
    assert "login" in str(exc.value)


def test_missing_session_raises_not_signed_in_with_login_hint(session_file):
    with pytest.raises(session_mod.NotSignedIn) as exc:
        session_mod.authed_request(
            "GET", "/api/runs", api_url="http://api",
            api_transport=httpx.MockTransport(lambda r: httpx.Response(200)),
            gotrue_transport=_gotrue_transport([]),
        )
    assert "intraday-trade-spy-research login" in str(exc.value)


def test_lax_file_mode_is_corrected(session_file):
    _write_session(session_file)
    session_file.chmod(0o644)
    session_mod.load_session()
    assert (session_file.stat().st_mode & 0o777) == 0o600


def test_module_never_touches_the_service_role_key():
    import inspect

    source = inspect.getsource(session_mod)
    assert "SERVICE_ROLE" not in source
