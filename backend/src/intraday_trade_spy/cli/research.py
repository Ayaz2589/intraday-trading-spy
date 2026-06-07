"""Research CLI (Feature 019, US1 / contracts/cli.md).

Every research pipeline step as one authenticated terminal command. Acts as
the operator via cli.session (email-OTP, persisted session); never the
service role. `--json` emits the raw API body so scripts compose against the
same contracts the frontend uses (FR-003).

Exit codes: 0 ok · 1 API/network error · 2 refused locally · 3 not signed in.
"""

from __future__ import annotations

import argparse
import json as jsonlib
import os
import sys
import time

import httpx

from intraday_trade_spy.cli import session as session_mod
from intraday_trade_spy.cli.session import LOGIN_HINT, NotSignedIn, authed_request
from intraday_trade_spy.validation.knobs import KNOB_REGISTRY

_POLL_S = 2.0


def _api_url() -> str:
    return os.environ.get("ITS_API_URL", "http://127.0.0.1:8001")


def _resolve_knob(raw: str) -> str | None:
    """Accept a dotted registry path or its unique leaf (FR-005)."""
    if raw in KNOB_REGISTRY:
        return raw
    leaves = {p.rsplit(".", 1)[-1]: p for p in KNOB_REGISTRY}
    return leaves.get(raw)


def _emit(body: dict, *, as_json: bool, summary: list[str] | None = None) -> None:
    if as_json:
        print(jsonlib.dumps(body))
        return
    for line in summary or []:
        print(line)
    print(jsonlib.dumps(body, indent=2))


def _request(method: str, path: str, *, json: dict | None = None,
             params: dict | None = None):
    return authed_request(method, path, api_url=_api_url(), json=json, params=params)


def _fail(resp) -> int:
    try:
        detail = resp.json()
    except ValueError:
        detail = {"error": resp.text}
    print(jsonlib.dumps(detail), file=sys.stderr)
    return 1


def _wait_study(study_id: str, as_json: bool) -> int:
    while True:
        resp = _request("GET", f"/api/validation/studies/{study_id}/status")
        if resp.status_code >= 400:
            return _fail(resp)
        body = resp.json()
        if body.get("status") in ("finished", "failed"):
            line = f"study {study_id} {body.get('status')} — view at /validation/{study_id}"
            _emit(body, as_json=as_json, summary=[line])
            return 0 if body.get("status") == "finished" else 1
        if not as_json:
            done = body.get("progress_completed", 0)
            total = body.get("progress_total", 0)
            print(f"… {done}/{total} evaluations", file=sys.stderr)
        time.sleep(_POLL_S)


def _wait_backfill(job_id: str, as_json: bool) -> int:
    while True:
        resp = _request("GET", f"/api/bars/backfill/{job_id}")
        if resp.status_code >= 400:
            return _fail(resp)
        body = resp.json()
        if body.get("status") in ("finished", "failed"):
            _emit(body, as_json=as_json,
                  summary=[f"backfill {job_id} {body.get('status')} — view at /data"])
            return 0 if body.get("status") == "finished" else 1
        time.sleep(_POLL_S)


# ---- command handlers (each returns an exit code) ----------------------------


def _cmd_login(args) -> int:
    session = session_mod.login(email=args.email)
    print(f"Signed in as {session['email']} — session stored.")
    return 0


def _cmd_whoami(args) -> int:
    session = session_mod.load_session()
    if session is None:
        print(LOGIN_HINT, file=sys.stderr)
        return 3
    print(session.get("email", "(unknown)"))
    return 0


def _cmd_logout(args) -> int:
    print("Signed out." if session_mod.delete_session() else "No session to remove.")
    return 0


def _cmd_backfill(args) -> int:
    body: dict = {}
    if args.start:
        body["start"] = args.start
    if args.end:
        body["end"] = args.end
    resp = _request("POST", "/api/bars/backfill", json=body)
    if resp.status_code >= 400:
        return _fail(resp)
    payload = resp.json()
    job_id = payload.get("job_id")
    if args.wait:
        return _wait_backfill(job_id, args.json)
    _emit(payload, as_json=args.json,
          summary=[f"backfill job {job_id} queued — view at /data"])
    return 0


def _start_study(body: dict, args) -> int:
    resp = _request("POST", "/api/validation/studies", json=body)
    if resp.status_code >= 400:
        return _fail(resp)
    payload = resp.json()
    study_id = payload.get("study_id")
    if args.wait:
        return _wait_study(study_id, args.json)
    _emit(payload, as_json=args.json,
          summary=[f"study {study_id} queued — view at /validation/{study_id}"])
    return 0


def _cmd_study_wf(args) -> int:
    return _start_study({"kind": "walk_forward", "config_name": args.config}, args)


def _cmd_study_sens(args) -> int:
    knob = _resolve_knob(args.knob)
    if knob is None:
        print(f"unknown knob {args.knob!r} — valid knobs:", file=sys.stderr)
        for path in KNOB_REGISTRY:
            print(f"  {path}", file=sys.stderr)
        return 2
    try:
        values = [float(v) for v in args.values.split(",") if v.strip()]
    except ValueError:
        print(f"--values must be comma-separated numbers, got {args.values!r}", file=sys.stderr)
        return 2
    body = {
        "kind": "sensitivity",
        "config_name": args.config,
        "segment": "train",
        "grid": [{"knob": knob, "values": values}],
    }
    return _start_study(body, args)


def _cmd_studies(args) -> int:
    resp = _request("GET", "/api/validation/studies")
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json, summary=["studies — view at /validation"])
    return 0


def _cmd_study_status(args) -> int:
    resp = _request("GET", f"/api/validation/studies/{args.id}/status")
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json,
          summary=[f"study {args.id} — view at /validation/{args.id}"])
    return 0


def _cmd_gate(args) -> int:
    resp = _request("POST", f"/api/validation/studies/{args.study}/pooled-gate",
                    json={"mode": args.mode})
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json,
          summary=[f"pooled gate for study {args.study} — view at /insights"])
    return 0


def _cmd_significance(args) -> int:
    resp = _request("POST", "/api/validation/significance", json={"run_id": args.run})
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json,
          summary=[f"significance for run {args.run} — view at /runs/{args.run}"])
    return 0


def _cmd_monte_carlo(args) -> int:
    resp = _request("POST", "/api/validation/monte-carlo", json={"run_id": args.run})
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json,
          summary=[f"monte carlo for run {args.run} — view at /runs/{args.run}"])
    return 0


def _cmd_lockbox(args) -> int:
    resp = _request("GET", "/api/validation/lockbox")
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json, summary=["lockbox — view at /validation"])
    return 0


def _cmd_lockbox_run(args) -> int:
    if not args.confirm:
        print(
            "REFUSED: the lockbox is a one-shot, irreversible test — you get "
            "exactly one clean read of the held-out data. Re-run with "
            "--confirm when you have deliberately chosen this candidate."
            + (" Burning a spent lockbox additionally requires --override --confirm."
               if args.override else ""),
            file=sys.stderr,
        )
        return 2
    resp = _request("POST", "/api/validation/lockbox/run",
                    json={"config_name": args.config, "override": bool(args.override)})
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json, summary=["lockbox run — view at /validation"])
    return 0


def _cmd_health(args) -> int:
    resp = _request("GET", "/api/recommend/health")
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json, summary=["config health — view at /strategies"])
    return 0


def _cmd_recommend(args) -> int:
    # /api/recommend/pack requires config_id; resolve it from the configs
    # list (active config by default, --config NAME to override).
    resp = _request("GET", "/api/configs")
    if resp.status_code >= 400:
        return _fail(resp)
    configs = resp.json().get("configs", [])
    wanted = getattr(args, "config", None)
    if wanted:
        match = next((c for c in configs if c.get("name") == wanted), None)
        if match is None:
            print(f"unknown config: {wanted}", file=sys.stderr)
            return 2
    else:
        match = next((c for c in configs if c.get("is_active")), None)
        if match is None:
            print("no active config — pass --config NAME", file=sys.stderr)
            return 2
    resp = _request("GET", "/api/recommend/pack", params={"config_id": match["id"]})
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json, summary=["recommendations — view at /insights"])
    return 0


def _cmd_analyze(args) -> int:
    body: dict = {"scope": args.scope, "force": bool(args.force)}
    if args.scope_id:
        body["scope_id"] = args.scope_id
    resp = _request("POST", "/api/insights/claude-analysis", json=body)
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json, summary=["advisory analysis — view at /insights"])
    return 0


def _cmd_campaign_start(args) -> int:
    body: dict = {"config_name": args.config}
    if args.budget is not None:
        body["budget"] = args.budget
    resp = _request("POST", "/api/research/campaigns", json=body)
    if resp.status_code >= 400:
        return _fail(resp)
    payload = resp.json()
    _emit(payload, as_json=args.json,
          summary=[f"campaign {payload.get('id')} running — view at /validation"])
    return 0


def _cmd_campaign_status(args) -> int:
    if args.id:
        resp = _request("GET", f"/api/research/campaigns/{args.id}")
        if resp.status_code >= 400:
            return _fail(resp)
        body = resp.json()
    else:
        resp = _request("GET", "/api/research/campaigns")
        if resp.status_code >= 400:
            return _fail(resp)
        campaigns = resp.json().get("campaigns", [])
        if not campaigns:
            print("no campaigns yet — start one with campaign-start", file=sys.stderr)
            return 1
        body = campaigns[0]
    cid = body.get("id")
    _emit(body, as_json=args.json,
          summary=[f"campaign {cid} {body.get('status')}"
                   f"{' · verdict ' + body['verdict'] if body.get('verdict') else ''}"
                   f" — view at /validation/campaigns/{cid}"])
    return 0


def _cmd_campaign_list(args) -> int:
    resp = _request("GET", "/api/research/campaigns")
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json, summary=["campaigns — view at /validation"])
    return 0


def _cmd_campaign_cancel(args) -> int:
    resp = _request("POST", f"/api/research/campaigns/{args.id}/cancel")
    if resp.status_code >= 400:
        return _fail(resp)
    _emit(resp.json(), as_json=args.json,
          summary=[f"campaign {args.id} cancelling — it halts at the next stage boundary"])
    return 0


# ---- parser -------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="intraday-trade-spy-research",
        description="Terminal research pipeline (Feature 019). Signs in as YOU; "
                    "never the service role. There is deliberately no reset command.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def add(name, handler, configure=None, json_flag=True):
        p = sub.add_parser(name)
        if json_flag:
            p.add_argument("--json", action="store_true", help="emit the raw API body")
        if configure:
            configure(p)
        p.set_defaults(handler=handler)
        return p

    add("login", _cmd_login, lambda p: p.add_argument("--email"), json_flag=False)
    add("whoami", _cmd_whoami, json_flag=False)
    add("logout", _cmd_logout, json_flag=False)

    add("backfill", _cmd_backfill, lambda p: (
        p.add_argument("--start"), p.add_argument("--end"),
        p.add_argument("--wait", action="store_true")))
    add("study-wf", _cmd_study_wf, lambda p: (
        p.add_argument("--config", required=True),
        p.add_argument("--wait", action="store_true")))
    add("study-sens", _cmd_study_sens, lambda p: (
        p.add_argument("--config", required=True),
        p.add_argument("--knob", required=True),
        p.add_argument("--values", required=True),
        p.add_argument("--wait", action="store_true")))
    add("studies", _cmd_studies)
    add("study-status", _cmd_study_status, lambda p: p.add_argument("id"))
    add("gate", _cmd_gate, lambda p: (
        p.add_argument("study"),
        p.add_argument("--mode", choices=["fast", "full"], default="fast")))
    add("significance", _cmd_significance, lambda p: p.add_argument("run"))
    add("monte-carlo", _cmd_monte_carlo, lambda p: p.add_argument("run"))
    add("lockbox", _cmd_lockbox)
    add("lockbox-run", _cmd_lockbox_run, lambda p: (
        p.add_argument("--config", required=True),
        p.add_argument("--confirm", action="store_true"),
        p.add_argument("--override", action="store_true")))
    add("health", _cmd_health)
    add("recommend", _cmd_recommend, lambda p: p.add_argument("--config"))
    add("analyze", _cmd_analyze, lambda p: (
        p.add_argument("--scope", choices=["study", "insights", "recommend"], required=True),
        p.add_argument("--scope-id"),
        p.add_argument("--force", action="store_true")))
    add("campaign-start", _cmd_campaign_start, lambda p: (
        p.add_argument("--config", required=True),
        p.add_argument("--budget", type=int)))
    add("campaign-status", _cmd_campaign_status, lambda p: p.add_argument("id", nargs="?"))
    add("campaign-list", _cmd_campaign_list)
    add("campaign-cancel", _cmd_campaign_cancel, lambda p: p.add_argument("id"))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # argparse refusals (unknown command, bad args)
        return int(exc.code or 2)
    try:
        return args.handler(args)
    except NotSignedIn as exc:
        print(str(exc), file=sys.stderr)
        return 3
    except (httpx.HTTPError, OSError, ValueError) as exc:  # network/local failures
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
