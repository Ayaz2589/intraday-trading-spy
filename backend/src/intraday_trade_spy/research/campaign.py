"""The auto-research campaign cycle engine (Feature 019, FR-007..FR-013).

Pure orchestration over injected collaborators (study runner, pooled gate,
recommendation engine, data freshness) so every verdict path is unit-testable.
Per cycle: data → study → gate (at the tightened bar 1 − α/k) → act on the
top-ranked deterministic candidate. Halts ONLY with: ready_for_lockbox /
stop_tuning / budget_exhausted / cancelled / failed.

Governance, by construction and by test:
- it never touches the lockbox — the terminal success state hands the
  candidate to the HUMAN (SC-003 asserts zero such storage calls);
- it acts only on deterministic candidates (the advisory narrator is never
  invoked from here);
- gather-evidence runs at most once per (family, prescription) per campaign —
  a repeat halts as stop_tuning, so campaigns terminate even though evidence
  studies consume no candidate budget (analyze G1);
- every candidate becomes a provenance-stamped trial-ledger row (FR-010) and
  every stage transition is journaled (constitution VII).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from intraday_trade_spy.research.bar_schedule import bar_level, family_key, k_for
from intraday_trade_spy.research.naming import candidate_name


class DataUnavailable(Exception):
    """The data-freshness stage could not produce a usable bar cache."""


@dataclass
class Collaborators:
    """The engine's injected dependencies (research.md R3: composed in-process
    by the router's default factory; stubbed in tests)."""

    ensure_data: Callable[[], dict | None]
    run_walk_forward: Callable[[str], str]
    pooled_gate: Callable[..., dict]
    next_candidates: Callable[[str], list[dict]]
    run_gather_study: Callable[[dict], str]
    create_config: Callable[[str, list[dict]], dict]


def _now() -> str:
    return datetime.now(UTC).isoformat()


class _Halt(Exception):
    def __init__(self, verdict: str, detail: dict):
        self.verdict = verdict
        self.detail = detail
        super().__init__(verdict)


def run_campaign(*, storage, campaign: dict, base_alpha: float, collab: Collaborators) -> dict:
    """Run a persisted 'running' campaign row to its terminal state."""
    campaign_id = campaign["id"]
    strategy_id = campaign["strategy_id"]
    budget = int(campaign["budget"])
    seq = int(campaign["seq"])

    candidate = campaign["starting_config_name"]
    family = ""  # the operator's own config keys the empty family (k = 1)
    trials_used = 0
    gathered: set[tuple] = set()
    cycle = 0

    def journal(message: str, details: dict | None = None) -> None:
        storage.insert_journal_event(
            event_id=str(uuid4()), occurred_at=_now(), kind="campaign",
            message=message, details={"campaign_id": campaign_id, **(details or {})},
        )

    def cancelled() -> bool:
        row = storage.get_research_campaign(campaign_id=campaign_id)
        return bool(row and row.get("cancel_requested"))

    def halt(verdict: str, detail: dict, *, status: str = "halted") -> dict:
        storage.halt_research_campaign(
            campaign_id=campaign_id, status=status, verdict=verdict,
            verdict_detail=detail,
        )
        journal(f"campaign halted: {verdict}", {"verdict": verdict, **detail})
        return {"verdict": verdict, "detail": detail}

    while True:
        if cancelled():
            return halt("cancelled", {"at_cycle": cycle + 1})
        cycle += 1
        entry: dict = {
            "cycle": cycle,
            "candidate_config_name": candidate,
            "family": family,
            "stages": [],
            "started_at": _now(),
        }

        def stage(name: str, status: str, detail: dict, *, _entry=entry, _cycle=cycle) -> None:
            _entry["stages"].append({"stage": name, "status": status, "detail": detail})
            journal(f"cycle {_cycle}: {name} {status}", {"stage": name, **detail})

        try:
            # ---- data: verify currency, auto-backfilling gaps (FR-007) ----
            try:
                data_detail = collab.ensure_data() or {}
                stage("data", "ok", data_detail)
            except DataUnavailable as exc:
                stage("data", "fail", {"reason": str(exc)})
                raise _Halt("failed", {"reason": str(exc), "failed_stage": "data"}) from exc

            if cancelled():
                raise _Halt("cancelled", {"at_cycle": cycle})

            # ---- study: walk-forward on the current candidate ----
            study_id = collab.run_walk_forward(candidate)
            stage("study", "ok", {"study_id": study_id})

            if cancelled():
                raise _Halt("cancelled", {"at_cycle": cycle})

            # ---- gate: the tightened bar (FR-009) ----
            k = k_for(storage, strategy_id=strategy_id, family=family)
            level = bar_level(k, base_alpha=base_alpha)
            gate = collab.pooled_gate(study_id=study_id, level=level,
                                      bar={"k": k, "level": level})
            gate_detail = {
                "k": k, "level": level, "study_id": study_id,
                "ci_low": gate.get("ci_low"), "ci_high": gate.get("ci_high"),
            }
            if gate.get("passed"):
                stage("gate", "pass", gate_detail)
                entry["ended_at"] = _now()
                storage.append_campaign_cycle(campaign_id=campaign_id, cycle_entry=entry)
                return halt("ready_for_lockbox",
                            {"candidate": candidate, "study_id": study_id,
                             "bar": {"k": k, "level": level}})
            stage("gate", "fail", gate_detail)

            if cancelled():
                raise _Halt("cancelled", {"at_cycle": cycle})

            # ---- act: the recommendation engine's top-ranked next step ----
            acted = False
            for cand in collab.next_candidates(candidate):
                klass = cand.get("klass")

                if klass == "stop_tuning":
                    raise _Halt("stop_tuning",
                                {"reason": cand.get("narrative_hint") or "stop_tuning"})

                if klass == "gather_evidence":
                    spec = cand.get("study")
                    hint = cand.get("narrative_hint", "")
                    if not spec:
                        # No machine-readable prescription: halt honestly with
                        # the guidance instead of inventing research.
                        raise _Halt("stop_tuning",
                                    {"reason": "no_novel_candidates", "hint": hint})
                    gkey = (family_key(cand.get("changes") or []),
                            json.dumps(spec, sort_keys=True))
                    if gkey in gathered:  # analyze G1: once per family
                        raise _Halt("stop_tuning",
                                    {"reason": "no_novel_candidates", "hint": hint})
                    gathered.add(gkey)
                    gather_study_id = collab.run_gather_study(spec)
                    stage("act", "ok", {"action": "gather_evidence",
                                        "study_id": gather_study_id})
                    acted = True
                    break

                if klass == "knob_delta":
                    if trials_used >= budget:
                        raise _Halt("budget_exhausted",
                                    {"budget": budget, "trials_used": trials_used})
                    changes = cand.get("changes") or []
                    name = candidate_name(seq=seq, cycle=cycle, changes=changes)
                    if cand.get("already_tried") or storage.get_config_by_name(name):
                        continue  # duplicate — skip to the next ranked candidate
                    fam = family_key(changes)
                    cfg_row = collab.create_config(name, changes)
                    storage.insert_recommendation_trial(
                        strategy_id=strategy_id, config_id=cfg_row.get("id"),
                        config_name=name, analysis_id=None, source="deterministic",
                        campaign_id=campaign_id, cycle=cycle, family=fam,
                    )
                    trials_used += 1
                    stage("act", "ok", {"action": "knob_delta", "changes": changes,
                                        "config_id": cfg_row.get("id"),
                                        "config_name": name})
                    candidate, family = name, fam
                    acted = True
                    break

            if not acted:
                raise _Halt("stop_tuning", {"reason": "no_novel_candidates"})

            entry["ended_at"] = _now()
            storage.append_campaign_cycle(campaign_id=campaign_id, cycle_entry=entry)

        except _Halt as h:
            entry["ended_at"] = _now()
            if entry["stages"]:
                storage.append_campaign_cycle(campaign_id=campaign_id, cycle_entry=entry)
            return halt(h.verdict, h.detail,
                        status="failed" if h.verdict == "failed" else "halted")
        except Exception as exc:  # fail-soft: never a phantom 'running' row
            entry["stages"].append(
                {"stage": "error", "status": "fail", "detail": {"reason": str(exc)}})
            entry["ended_at"] = _now()
            storage.append_campaign_cycle(campaign_id=campaign_id, cycle_entry=entry)
            return halt("failed", {"reason": str(exc)}, status="failed")
