"""GET /healthz — liveness + DB-reachability probe.

Unauthenticated by design (deployment platforms hit it). Returns 200 when
the service is up and a SELECT 1 against Supabase succeeded; 503 when the
service is up but the DB is unreachable.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Response
from fastapi.responses import HTMLResponse

from intraday_trade_spy.api.schemas import HealthResponse


router = APIRouter()


@router.get("/auth/callback", response_class=HTMLResponse, include_in_schema=False)
def auth_callback() -> HTMLResponse:
    """Dev helper: catches Supabase magic-link redirects and exposes the
    access_token to the user (the token lives in the URL fragment after `#`,
    which the server never receives). Pure client-side JS — no auth, no
    backend dependency.

    Point Supabase's Site URL at `http://localhost:8001/auth/callback` to
    use this. Feature 007 will replace this with a real frontend flow.
    """
    return HTMLResponse(
        """
<!doctype html><meta charset="utf-8"><title>Supabase token capture</title>
<style>
body{font-family:system-ui,sans-serif;background:#0b0e14;color:#e6edf3;padding:32px;max-width:900px;margin:0 auto;}
h1{font-size:18px;color:#7ee787;margin-bottom:16px;}
pre{background:#161b22;border:1px solid #30363d;padding:16px;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.5;}
button{background:#238636;border:0;color:white;padding:10px 16px;border-radius:6px;cursor:pointer;font-size:14px;margin-top:12px;}
button:hover{background:#2ea043;}
.row{margin-bottom:24px;}
.label{font-size:12px;color:#7d8590;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;}
.copied{color:#7ee787;font-size:12px;margin-left:8px;display:none;}
</style>
<h1>Supabase access token captured</h1>
<p style="color:#7d8590;font-size:14px;">Sign-in via magic link completed. Below is the access_token to use as your Bearer token when curling the API.</p>
<div class="row">
  <div class="label">access_token</div>
  <pre id="at">(none — open this page via the magic link redirect)</pre>
  <button onclick="copyAt()">Copy access_token</button><span id="ok" class="copied">copied</span>
</div>
<div class="row">
  <div class="label">refresh_token</div>
  <pre id="rt">(none)</pre>
</div>
<div class="row">
  <div class="label">expires_at</div>
  <pre id="ex">(none)</pre>
</div>
<script>
function parse(){
  const h = location.hash.startsWith('#') ? location.hash.substring(1) : '';
  const p = new URLSearchParams(h);
  return Object.fromEntries(p.entries());
}
const t = parse();
if(t.access_token) document.getElementById('at').textContent = t.access_token;
if(t.refresh_token) document.getElementById('rt').textContent = t.refresh_token;
if(t.expires_at) document.getElementById('ex').textContent = t.expires_at;
function copyAt(){
  const el = document.getElementById('at');
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const ok = document.getElementById('ok');
    ok.style.display='inline';
    setTimeout(()=>ok.style.display='none',1500);
  });
}
</script>
"""
    )


@router.get("/healthz", response_model=HealthResponse)
def healthz(response: Response) -> HealthResponse:
    url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_role_key:
        response.status_code = 503
        return HealthResponse(status="ok", db="unreachable")

    try:
        from intraday_trade_spy.storage import SupabaseStorageClient

        # Use a sentinel user_id; we don't actually scope by user for the probe.
        client = SupabaseStorageClient(
            url=url,
            service_role_key=service_role_key,
            user_id="00000000-0000-0000-0000-000000000000",
        )
        client.health_check(timeout_s=5.0)
    except Exception:
        response.status_code = 503
        return HealthResponse(status="ok", db="unreachable")

    return HealthResponse(status="ok", db="ok")
