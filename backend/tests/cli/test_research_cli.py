"""Feature 019 T007 — research CLI command surface (contracts/cli.md).

Parsing, local validation, confirmation gates, --json passthrough, exit
codes. The session layer is tested separately (test_session.py); here
`authed_request` is monkeypatched to capture calls.
"""

import json

import httpx
import pytest

from intraday_trade_spy.cli import research as cli
from intraday_trade_spy.cli.session import NotSignedIn


class FakeApi:
    """Captures authed_request calls; returns queued responses (default 200 {})."""

    def __init__(self):
        self.calls = []
        self.queue = []

    def push(self, status, body):
        self.queue.append(httpx.Response(status, json=body))

    def __call__(self, method, path, *, api_url, json=None, params=None, **kw):
        self.calls.append({"method": method, "path": path, "json": json, "params": params})
        if self.queue:
            return self.queue.pop(0)
        return httpx.Response(200, json={})


@pytest.fixture
def api(monkeypatch):
    fake = FakeApi()
    monkeypatch.setattr(cli, "authed_request", fake)
    return fake


def run(argv):
    return cli.main(argv)


# ---- studies ----------------------------------------------------------------

def test_study_wf_posts_and_prints_id_and_ui_location(api, capsys):
    api.push(202, {"study_id": "s-9", "status": "queued", "planned_evaluations": 12})
    code = run(["study-wf", "--config", "default"])
    assert code == 0
    assert api.calls[0]["method"] == "POST"
    assert api.calls[0]["path"] == "/api/validation/studies"
    assert api.calls[0]["json"] == {"kind": "walk_forward", "config_name": "default"}
    out = capsys.readouterr().out
    assert "s-9" in out
    assert "/validation/s-9" in out  # FR-003: where to see it in the UI


def test_study_sens_resolves_leaf_knob_and_parses_values(api):
    api.push(202, {"study_id": "s-1", "status": "queued", "planned_evaluations": 4})
    code = run(["study-sens", "--config", "default", "--knob", "risk_reward",
                "--values", "1.5,2,2.5,3"])
    assert code == 0
    body = api.calls[0]["json"]
    assert body["kind"] == "sensitivity"
    assert body["segment"] == "train"
    assert body["grid"] == [{
        "knob": "strategy.vwap_pullback.target.risk_reward",
        "values": [1.5, 2.0, 2.5, 3.0],
    }]


def test_study_sens_accepts_full_dotted_path(api):
    api.push(202, {"study_id": "s-1", "status": "queued", "planned_evaluations": 2})
    code = run(["study-sens", "--config", "default",
                "--knob", "risk.max_risk_per_trade_pct", "--values", "0.05,0.1"])
    assert code == 0
    assert api.calls[0]["json"]["grid"][0]["knob"] == "risk.max_risk_per_trade_pct"


def test_study_sens_rejects_unknown_knob_locally_with_valid_list(api, capsys):
    code = run(["study-sens", "--config", "default", "--knob", "bogus", "--values", "1,2"])
    assert code == 2                      # refused locally (FR-005)
    assert api.calls == []                # nothing reached the server
    out = capsys.readouterr()
    assert "strategy.vwap_pullback.target.risk_reward" in out.err + out.out


# ---- lockbox confirmation gate (FR-004) --------------------------------------

def test_lockbox_run_without_confirm_sends_nothing(api, capsys):
    code = run(["lockbox-run", "--config", "default"])
    assert code == 2
    assert api.calls == []
    out = capsys.readouterr()
    assert "one" in (out.err + out.out).lower()  # explains the one-shot consequence


def test_lockbox_run_with_confirm_posts(api):
    api.push(200, {"state": "spent", "contaminated": False,
                   "config_fingerprint": "fp", "run_id": None, "summary": {}})
    code = run(["lockbox-run", "--config", "default", "--confirm"])
    assert code == 0
    assert api.calls[0]["path"] == "/api/validation/lockbox/run"
    assert api.calls[0]["json"] == {"config_name": "default", "override": False}


def test_lockbox_override_requires_confirm_too(api):
    code = run(["lockbox-run", "--config", "default", "--override"])
    assert code == 2
    assert api.calls == []


def test_no_reset_subcommand_exists():
    assert run(["reset"]) == 2  # argparse refusal — wiping data is UI-only (FR-004)


# ---- output contract ----------------------------------------------------------

def test_json_flag_emits_the_raw_api_body(api, capsys):
    body = {"studies": [{"id": "s-1", "kind": "walk_forward"}]}
    api.push(200, body)
    code = run(["studies", "--json"])
    assert code == 0
    assert json.loads(capsys.readouterr().out) == body


def test_api_error_prints_envelope_and_exits_1(api, capsys):
    api.push(503, {"detail": {"error": "db_unreachable", "message": "no db"}})
    code = run(["studies"])
    assert code == 1
    assert "db_unreachable" in capsys.readouterr().err


def test_not_signed_in_exits_3_with_hint(monkeypatch, capsys):
    def raise_nsi(*a, **k):
        raise NotSignedIn("Not signed in — run: intraday-trade-spy-research login")

    monkeypatch.setattr(cli, "authed_request", raise_nsi)
    code = run(["studies"])
    assert code == 3
    assert "login" in capsys.readouterr().err


# ---- campaigns ------------------------------------------------------------------

def test_campaign_start_posts_config_and_budget(api):
    api.push(202, {"id": "c-1", "status": "running", "cycles": []})
    code = run(["campaign-start", "--config", "default", "--budget", "4"])
    assert code == 0
    assert api.calls[0]["path"] == "/api/research/campaigns"
    assert api.calls[0]["json"] == {"config_name": "default", "budget": 4}


def test_campaign_status_without_id_uses_most_recent(api, capsys):
    api.push(200, {"campaigns": [{"id": "c-2", "status": "running", "cycles": [],
                                  "verdict": None}], "default_budget": 6})
    code = run(["campaign-status"])
    assert code == 0
    paths = [c["path"] for c in api.calls]
    assert paths == ["/api/research/campaigns"]
    assert "c-2" in capsys.readouterr().out


# ---- data ---------------------------------------------------------------------

def test_backfill_posts_range(api):
    api.push(202, {"job_id": "j-1", "status": "queued"})
    code = run(["backfill", "--start", "2024-01-01", "--end", "2024-02-01"])
    assert code == 0
    assert api.calls[0]["path"] == "/api/bars/backfill"
    assert api.calls[0]["json"] == {"start": "2024-01-01", "end": "2024-02-01"}


# ---- recommend (config_id resolution) ------------------------------------------

CONFIGS_BODY = {"configs": [
    {"id": "cfg-inactive", "name": "wf-rr3", "is_active": False},
    {"id": "cfg-active", "name": "default", "is_active": True},
]}


def test_recommend_resolves_active_config_id(api):
    """`recommend` must pass the active config's id — /api/recommend/pack requires it."""
    api.push(200, CONFIGS_BODY)
    api.push(200, {"pack": {}, "candidates": []})
    code = run(["recommend"])
    assert code == 0
    assert api.calls[0]["method"] == "GET"
    assert api.calls[0]["path"] == "/api/configs"
    assert api.calls[1]["path"] == "/api/recommend/pack"
    assert api.calls[1]["params"] == {"config_id": "cfg-active"}


def test_recommend_accepts_config_name_override(api):
    api.push(200, CONFIGS_BODY)
    api.push(200, {"pack": {}, "candidates": []})
    code = run(["recommend", "--config", "wf-rr3"])
    assert code == 0
    assert api.calls[1]["params"] == {"config_id": "cfg-inactive"}


def test_recommend_unknown_config_refused_locally(api, capsys):
    api.push(200, CONFIGS_BODY)
    code = run(["recommend", "--config", "nope"])
    assert code == 2
    assert len(api.calls) == 1  # never hit /api/recommend/pack
    assert "nope" in capsys.readouterr().err
