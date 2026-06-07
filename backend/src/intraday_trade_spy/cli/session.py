"""CLI operator session (Feature 019, FR-002 / contracts/cli-auth.md).

The research CLI is a PUBLIC client: it signs in with the same email-OTP
flow the web app uses (GoTrue REST + the anon key), persists the session at
~/.intraday-trade-spy/session.json (0600), and rotates the refresh token
automatically. It never reads the service-role key — that invariant is
asserted by test (tests/cli/test_session.py scans this module's source).
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx

LOGIN_HINT = "Not signed in — run: intraday-trade-spy-research login"
_REFRESH_WINDOW_S = 60


class NotSignedIn(Exception):
    """Raised when no usable session exists; message carries the remediation."""


def _session_path() -> Path:
    override = os.environ.get("ITS_SESSION_FILE")
    if override:
        return Path(override)
    return Path.home() / ".intraday-trade-spy" / "session.json"


def _gotrue_env() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    anon = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not anon:
        raise NotSignedIn(
            "SUPABASE_URL / SUPABASE_ANON_KEY not set — source backend/.env "
            "(the anon key is the frontend's VITE_SUPABASE_ANON_KEY)."
        )
    return url.rstrip("/"), anon


def load_session() -> dict | None:
    """Read the persisted session; correct lax file modes (cli-auth invariant)."""
    path = _session_path()
    if not path.exists():
        return None
    if (path.stat().st_mode & 0o077) != 0:
        path.chmod(0o600)
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    if not all(k in data for k in ("access_token", "refresh_token", "expires_at")):
        return None
    return data


def save_session(data: dict) -> None:
    path = _session_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))
    path.chmod(0o600)


def delete_session() -> bool:
    path = _session_path()
    if path.exists():
        path.unlink()
        return True
    return False


def _gotrue_post(url: str, anon: str, path: str, body: dict, transport=None) -> httpx.Response:
    with httpx.Client(transport=transport, timeout=30.0) as client:
        return client.post(
            f"{url}{path}",
            headers={"apikey": anon, "Content-Type": "application/json"},
            json=body,
        )


def _session_from_tokens(payload: dict, *, email: str, supabase_url: str) -> dict:
    expires_at = payload.get("expires_at")
    if expires_at is None:
        expires_at = time.time() + float(payload.get("expires_in", 3600))
    return {
        "supabase_url": supabase_url,
        "email": email,
        "access_token": payload["access_token"],
        "refresh_token": payload["refresh_token"],
        "expires_at": float(expires_at),
    }


def login(email: str | None = None, *, input_fn=input, transport=None) -> dict:
    """One-time interactive sign-in: request the email code, verify it, persist.

    Never prints tokens; never provisions accounts (create_user=False).
    """
    url, anon = _gotrue_env()
    if not email:
        email = input_fn("Email: ").strip()
    resp = _gotrue_post(url, anon, "/auth/v1/otp", {"email": email, "create_user": False},
                        transport=transport)
    if resp.status_code >= 400:
        raise NotSignedIn(f"could not send the sign-in code: {resp.text}")
    code = input_fn("Enter the 6-digit code from your email: ").strip()
    resp = _gotrue_post(url, anon, "/auth/v1/verify",
                        {"type": "email", "email": email, "token": code},
                        transport=transport)
    if resp.status_code >= 400:
        raise NotSignedIn(f"code verification failed: {resp.text}")
    session = _session_from_tokens(resp.json(), email=email, supabase_url=url)
    save_session(session)
    return session


def refresh(session: dict, *, transport=None) -> dict:
    """Exchange the refresh token; BOTH tokens rotate and persist atomically."""
    url, anon = _gotrue_env()
    resp = _gotrue_post(url, anon, "/auth/v1/token?grant_type=refresh_token",
                        {"refresh_token": session["refresh_token"]},
                        transport=transport)
    if resp.status_code >= 400:
        raise NotSignedIn(f"session expired and refresh failed — {LOGIN_HINT}")
    new = _session_from_tokens(resp.json(), email=session.get("email", ""), supabase_url=url)
    save_session(new)
    return new


def authed_request(
    method: str,
    path: str,
    *,
    api_url: str,
    json: dict | None = None,
    params: dict | None = None,
    api_transport=None,
    gotrue_transport=None,
    timeout: float = 600.0,
) -> httpx.Response:
    """Send one API request as the operator: refresh near expiry, retry a 401
    once after refreshing, raise NotSignedIn (with the login hint) otherwise."""
    session = load_session()
    if session is None:
        raise NotSignedIn(LOGIN_HINT)
    if session["expires_at"] < time.time() + _REFRESH_WINDOW_S:
        session = refresh(session, transport=gotrue_transport)

    def send(token: str) -> httpx.Response:
        with httpx.Client(transport=api_transport, timeout=timeout) as client:
            return client.request(
                method,
                f"{api_url.rstrip('/')}{path}",
                headers={"Authorization": f"Bearer {token}"},
                json=json,
                params=params,
            )

    resp = send(session["access_token"])
    if resp.status_code == 401:
        session = refresh(session, transport=gotrue_transport)
        resp = send(session["access_token"])
        if resp.status_code == 401:
            raise NotSignedIn(f"the API rejected the session — {LOGIN_HINT}")
    return resp
