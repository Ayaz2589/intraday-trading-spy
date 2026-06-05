"""Feature 016 — claude_analyst unit tests. The Anthropic SDK is FULLY MOCKED
(no network): the client factory is monkeypatched; provider failures are real
anthropic exception instances built over fake httpx responses."""

from __future__ import annotations

from unittest import mock

import anthropic
import httpx
import pytest

from intraday_trade_spy.api import claude_analyst as ca

USER = "11111111-1111-1111-1111-111111111111"


# ---- helpers -----------------------------------------------------------------


def _status_err(cls, status: int, err_type: str):
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    body = {"error": {"type": err_type, "message": err_type}}
    resp = httpx.Response(status, request=req, json=body)
    return cls(err_type, response=resp, body=body)


def _analysis_obj():
    from intraday_trade_spy.models import ClaudeAnalysis, ClaudeExperiment, ClaudeFinding

    return ClaudeAnalysis(
        summary="The edge concentrates in H2 windows.",
        findings=[
            ClaudeFinding(
                claim="Pooled expectancy is positive but not significant",
                evidence_metric="pooled_gate.expectancy_dollars_ci",
                confidence="high",
            )
        ],
        risks=["Two windows bleed heavily"],
        suggested_experiments=[
            ClaudeExperiment(hypothesis="Regime filter helps", how_to_test="Run filtered walk-forward")
        ],
    )


def _mock_client(parsed=None):
    client = mock.MagicMock()
    response = mock.MagicMock()
    response.parsed_output = parsed if parsed is not None else _analysis_obj()
    client.messages.parse.return_value = response
    return client


def _storage(*, settings=None, latest=None):
    s = mock.MagicMock()
    s.get_insight_settings.return_value = settings or {
        "claude_enabled": True, "disabled_reason": None,
    }
    s.get_latest_insight_analysis.return_value = latest
    s.insights_edge_timeseries.return_value = {
        "points": [{"run_id": f"r{i}", "net_pnl": float(i)} for i in range(5)],
        "snapshot_fingerprint": "fp-edge",
    }
    s.insights_config_distribution.return_value = {
        "rows": [{"config_name": "wf-rr3", "windows": 12}],
        "snapshot_fingerprint": "fp-dist",
    }
    s.insert_insight_analysis.return_value = {"id": "ia1"}
    return s


def _run(storage, client, *, scope="insights", scope_id=None, force=False, monkeypatch=None):
    monkeypatch.setattr(ca, "_get_client", lambda cfg=None: client)
    return ca.run_claude_analysis(
        scope=scope, scope_id=scope_id, force=force, user_id=USER, storage=storage
    )


# ---- payload identity ---------------------------------------------------------


def test_payload_hash_deterministic_across_orderings():
    a = ca.payload_hash({"b": 2, "a": [3, 1]})
    b = ca.payload_hash({"a": [3, 1], "b": 2})
    assert a == b and len(a) == 64
    assert ca.payload_hash({"a": [1, 3], "b": 2}) != a  # list order matters


def test_insights_payload_truncates_and_flags():
    points = [{"run_id": f"r{i}", "range_start": f"2020-{i:02d}"} for i in range(1, 6)]
    payload = ca.build_insights_payload(
        timeseries={"points": points, "snapshot_fingerprint": "fp-edge"},
        distribution={"rows": [], "snapshot_fingerprint": "fp-dist"},
        max_windows=3,
    )
    assert payload["truncated"] is True
    assert len(payload["timeseries"]["points"]) == 3
    assert payload["fingerprints"] == {"timeseries": "fp-edge", "distribution": "fp-dist"}


def test_study_payload_requires_computed_gate():
    study = {"id": "s1", "kind": "walk_forward", "params": {}, "result": {"windows": []}}
    with pytest.raises(ca.ClaudeBadRequest):
        ca.build_study_payload(study=study)
    study["result"]["pooled_gate"] = {"computed_at": "t1", "passed": False}
    payload = ca.build_study_payload(study=study)
    assert payload["study_id"] == "s1"
    assert payload["pooled_gate"]["computed_at"] == "t1"


# ---- gating before any provider call -------------------------------------------


def test_paused_settings_block_before_client(monkeypatch):
    storage = _storage(settings={"claude_enabled": False, "disabled_reason": "manual"})
    client = _mock_client()
    with pytest.raises(ca.ClaudePaused):
        _run(storage, client, monkeypatch=monkeypatch)
    client.messages.parse.assert_not_called()


def test_missing_api_key_is_unconfigured(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ca, "_client", None)
    with pytest.raises(ca.ClaudeUnconfigured):
        ca._get_client()


# ---- idempotency ---------------------------------------------------------------


def test_unchanged_hash_returns_stored_without_provider_call(monkeypatch):
    storage = _storage()
    # Compute the hash the analyst would produce for this payload.
    payload = ca.build_insights_payload(
        timeseries=storage.insights_edge_timeseries.return_value,
        distribution=storage.insights_config_distribution.return_value,
        max_windows=200,
    )
    stored = {
        "id": "ia0", "scope": "insights", "scope_id": None,
        "payload_hash": ca.payload_hash(payload), "model": "claude-opus-4-8",
        "analysis": {"summary": "stored"}, "created_at": "2026-06-05T00:00:00Z",
    }
    storage.get_latest_insight_analysis.return_value = stored
    client = _mock_client()
    out = _run(storage, client, monkeypatch=monkeypatch)
    assert out["id"] == "ia0"
    client.messages.parse.assert_not_called()
    storage.insert_insight_analysis.assert_not_called()


def test_force_regenerates_despite_matching_hash(monkeypatch):
    storage = _storage()
    payload = ca.build_insights_payload(
        timeseries=storage.insights_edge_timeseries.return_value,
        distribution=storage.insights_config_distribution.return_value,
        max_windows=200,
    )
    storage.get_latest_insight_analysis.return_value = {
        "id": "ia0", "payload_hash": ca.payload_hash(payload),
        "analysis": {"summary": "stored"}, "model": "m", "created_at": "t",
    }
    client = _mock_client()
    _run(storage, client, force=True, monkeypatch=monkeypatch)
    client.messages.parse.assert_called_once()
    storage.insert_insight_analysis.assert_called_once()


# ---- the call itself ------------------------------------------------------------


def test_parse_called_with_schema_adaptive_thinking_and_cache_marker(monkeypatch):
    from intraday_trade_spy.models import ClaudeAnalysis

    storage = _storage()
    client = _mock_client()
    _run(storage, client, monkeypatch=monkeypatch)
    kwargs = client.messages.parse.call_args.kwargs
    assert kwargs["output_format"] is ClaudeAnalysis
    assert kwargs["thinking"] == {"type": "adaptive"}
    system = kwargs["system"]
    assert system[0]["cache_control"] == {"type": "ephemeral"}
    assert "advisory" in system[0]["text"].lower()


def test_success_persists_and_returns_view(monkeypatch):
    storage = _storage()
    client = _mock_client()
    out = _run(storage, client, monkeypatch=monkeypatch)
    ins = storage.insert_insight_analysis.call_args.kwargs
    assert ins["scope"] == "insights"
    assert ins["analysis"]["summary"].startswith("The edge")
    assert out["analysis"]["summary"].startswith("The edge")
    assert out["payload_hash"] == ins["payload_hash"]


# ---- failure taxonomy ------------------------------------------------------------


def test_billing_error_flips_settings_and_pauses(monkeypatch):
    storage = _storage()
    client = _mock_client()
    client.messages.parse.side_effect = _status_err(anthropic.APIStatusError, 400, "billing_error")
    with pytest.raises(ca.ClaudePaused) as exc:
        _run(storage, client, monkeypatch=monkeypatch)
    assert exc.value.disabled_reason == "billing"
    storage.update_insight_settings.assert_called_once()
    kwargs = storage.update_insight_settings.call_args.kwargs
    assert kwargs["claude_enabled"] is False
    assert kwargs["disabled_reason"] == "billing"


def test_authentication_error_hints_setup_and_does_not_flip(monkeypatch):
    storage = _storage()
    client = _mock_client()
    client.messages.parse.side_effect = _status_err(
        anthropic.AuthenticationError, 401, "authentication_error"
    )
    with pytest.raises(ca.ClaudeUnconfigured):
        _run(storage, client, monkeypatch=monkeypatch)
    storage.update_insight_settings.assert_not_called()


def test_rate_limit_is_transient_and_persists_nothing(monkeypatch):
    storage = _storage()
    client = _mock_client()
    client.messages.parse.side_effect = _status_err(
        anthropic.RateLimitError, 429, "rate_limit_error"
    )
    with pytest.raises(ca.ClaudeTransient):
        _run(storage, client, monkeypatch=monkeypatch)
    storage.insert_insight_analysis.assert_not_called()
    storage.update_insight_settings.assert_not_called()


def test_unparseable_analysis_is_a_parse_failure(monkeypatch):
    storage = _storage()
    client = _mock_client(parsed=False)  # placeholder; overridden below
    client.messages.parse.return_value = mock.MagicMock(parsed_output=None)
    with pytest.raises(ca.ClaudeParseFailure):
        _run(storage, client, monkeypatch=monkeypatch)
    storage.insert_insight_analysis.assert_not_called()


# ---- Feature 017: structured knob suggestions (sanitize-before-store) --------


def _analysis_with_changes():
    from intraday_trade_spy.models import (
        ClaudeAnalysis, ClaudeExperiment, ConfigChange,
    )

    return ClaudeAnalysis(
        summary="s",
        findings=[],
        risks=[],
        suggested_experiments=[
            ClaudeExperiment(
                hypothesis="Wider VWAP distance",
                how_to_test="Run a walk-forward",
                suggested_config_changes=[
                    ConfigChange(
                        knob_path="strategy.vwap_pullback.target.risk_reward",
                        value=2.5,
                    ),                                                # valid
                    ConfigChange(knob_path="broker.fees_per_share", value=0.0),  # off-list
                    ConfigChange(
                        knob_path="strategy.vwap_pullback.max_distance_from_vwap_pct",
                        value=99.0,
                    ),                                                # out of bounds
                ],
            ),
            ClaudeExperiment(
                hypothesis="Regime filter",
                how_to_test="Needs new code",
                suggested_config_changes=[
                    ConfigChange(knob_path="made.up.path", value=1.0),  # all invalid
                ],
            ),
        ],
    )


def test_system_prompt_carries_the_registry_section(monkeypatch):
    from intraday_trade_spy.validation.knobs import KNOB_REGISTRY

    storage = _storage()
    client = _mock_client()
    _run(storage, client, monkeypatch=monkeypatch)
    system_text = client.messages.parse.call_args.kwargs["system"][0]["text"]
    for path in KNOB_REGISTRY:
        assert path in system_text


def test_suggestions_are_sanitized_before_storage(monkeypatch):
    storage = _storage()
    client = _mock_client(parsed=_analysis_with_changes())
    _run(storage, client, monkeypatch=monkeypatch)
    stored = storage.insert_insight_analysis.call_args.kwargs["analysis"]
    exp0 = stored["suggested_experiments"][0]["suggested_config_changes"]
    assert exp0 == [
        {"knob_path": "strategy.vwap_pullback.target.risk_reward", "value": 2.5}
    ]
    # every suggestion invalid -> stored as [] (renders text-only)
    assert stored["suggested_experiments"][1]["suggested_config_changes"] == []


def test_no_suggestion_analysis_behaves_as_016(monkeypatch):
    storage = _storage()
    client = _mock_client()  # default fixture has no suggestions
    _run(storage, client, monkeypatch=monkeypatch)
    stored = storage.insert_insight_analysis.call_args.kwargs["analysis"]
    for exp in stored["suggested_experiments"]:
        assert exp["suggested_config_changes"] == []


def test_payload_builders_carry_schema_version_2():
    ts = {"points": [{"run_id": "r1"}], "snapshot_fingerprint": "a"}
    dist = {"rows": [], "snapshot_fingerprint": "b"}
    p = ca.build_insights_payload(timeseries=ts, distribution=dist, max_windows=10)
    assert p["analysis_schema_version"] == 2
    versionless = {k: v for k, v in p.items() if k != "analysis_schema_version"}
    assert ca.payload_hash(p) != ca.payload_hash(versionless)  # R3: hash invalidation

    study = {"id": "s1", "params": {}, "result": {"pooled_gate": {"computed_at": "t"}}}
    assert ca.build_study_payload(study=study)["analysis_schema_version"] == 2


def test_generation_path_never_mutates_configs(monkeypatch):
    # SC-003 / Constitution II (analyze C1): the analysis pipeline has NO
    # config write path — not on success, not on failure.
    storage = _storage()
    client = _mock_client(parsed=_analysis_with_changes())
    _run(storage, client, monkeypatch=monkeypatch)
    storage.create_config.assert_not_called()
    storage.update_config.assert_not_called()
    storage.set_active_config.assert_not_called()
