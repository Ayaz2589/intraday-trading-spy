"""Feature 018 (US2): deterministic candidate generation over an evidence
pack. Three classes (FR-007):

  knob_delta       — a whitelisted knob change the archive has actually
                     measured (sensitivity plateau move or matched-window
                     cross-config transfer); never an untested invention
  gather_evidence  — the honest "you don't have the data for this yet"
  stop_tuning      — every computed family gate failed: stop turning knobs

Score: improvement_r × log2(1 + evidence_n); ties break lexicographically on
the change set — stable sort, identical packs yield identical rankings
(SC-002). Every emitted change passes the 017 registry sanitation (FR-006)."""

from __future__ import annotations

import json
import math
from statistics import median

from intraday_trade_spy.config import InsightsHealthConfig, InsightsRecommendConfig
from intraday_trade_spy.recommend.evidence import build_evidence_pack, knob_projection
from intraday_trade_spy.recommend.health import compute_health, gate_from_dist_row
from intraday_trade_spy.validation.knobs import sanitize_changes

_EPS = 1e-9


def _change_key(changes: list[dict]) -> tuple:
    return tuple(sorted((c["knob_path"], c["value"]) for c in changes))


def _already_tried(
    target_proj: dict, changes: list[dict], configs: list[dict], target_name: str
) -> dict | None:
    """Flag a candidate whose resulting knob set equals an existing config's
    (FR-006) — link the evidence instead of re-suggesting the experiment."""
    proj = dict(target_proj)
    for ch in changes:
        proj[ch["knob_path"]] = ch["value"]
    for c in sorted(configs, key=lambda c: str(c.get("name"))):
        if c.get("name") == target_name:
            continue
        cp = knob_projection(c.get("params"))
        if cp.keys() == proj.keys() and all(abs(cp[k] - proj[k]) <= _EPS for k in proj):
            return {"config_id": str(c.get("id")), "config_name": c.get("name")}
    return None


def _plateau_candidates(pack: dict, thresholds: InsightsRecommendConfig) -> list[dict]:
    out: list[dict] = []
    for si, s in enumerate(pack.get("sensitivity") or []):
        cur = s.get("current_value")
        if cur is None:
            continue
        values = s.get("values") or []
        if not values:
            continue
        nearest = min(values, key=lambda v: (abs(v["value"] - cur), v["value"]))
        cur_nb = nearest.get("neighborhood_mean")
        if cur_nb is None:
            continue
        for vi, v in enumerate(values):
            if abs(v["value"] - nearest["value"]) <= _EPS:
                continue
            nb = v.get("neighborhood_mean")
            if nb is None:
                continue
            improvement = nb - cur_nb
            if improvement < thresholds.min_improvement_r - _EPS:
                continue
            changes = [
                c.model_dump()
                for c in sanitize_changes([{"knob_path": s["knob_path"], "value": v["value"]}])
            ]
            if not changes:
                continue
            knob_leaf = s["knob_path"].rsplit(".", 1)[-1]
            out.append(
                {
                    "klass": "knob_delta",
                    "score": improvement * math.log2(1 + v["evidence_n"]),
                    "changes": changes,
                    "evidence": [
                        {
                            "metric_path": f"sensitivity.{si}.values.{vi}.neighborhood_mean",
                            "value": nb,
                        },
                        {"metric_path": f"sensitivity.{si}.current_value", "value": cur},
                    ],
                    "narrative_hint": (
                        f"sensitivity neighborhood at {knob_leaf}={changes[0]['value']:g} "
                        f"averages {nb:.3f} vs {cur_nb:.3f} at the current value"
                    ),
                }
            )
    return out


def _transfer_candidates(pack: dict, thresholds: InsightsRecommendConfig) -> list[dict]:
    by_other: dict[str, list[tuple[int, dict]]] = {}
    for mi, m in enumerate(pack.get("matched") or []):
        if m.get("transfer_eligible"):
            by_other.setdefault(str(m["other_config"]), []).append((mi, m))

    out: list[dict] = []
    for other in sorted(by_other):
        rows = by_other[other]
        if len(rows) < thresholds.min_shared_windows:
            continue
        t_med = float(median(m["target_expectancy_r"] for _, m in rows))
        o_med = float(median(m["other_expectancy_r"] for _, m in rows))
        improvement = o_med - t_med
        if improvement < thresholds.min_improvement_r - _EPS:
            continue
        raw = [
            {"knob_path": d["knob_path"], "value": d["other_value"]}
            for d in (rows[0][1].get("knob_diff") or [])
        ]
        changes = [c.model_dump() for c in sanitize_changes(raw)]
        if not changes or len(changes) != len(raw):
            continue  # the evidence backs the combo — all changes or none
        first_idx = rows[0][0]
        out.append(
            {
                "klass": "knob_delta",
                "score": improvement * math.log2(1 + len(rows)),
                "changes": changes,
                "evidence": [
                    {
                        "metric_path": f"matched.{first_idx}.other_expectancy_r",
                        "value": rows[0][1]["other_expectancy_r"],
                    },
                    {
                        "metric_path": f"matched.{first_idx}.target_expectancy_r",
                        "value": rows[0][1]["target_expectancy_r"],
                    },
                ],
                "narrative_hint": (
                    f"{other} beats {pack['config_name']} on {len(rows)} shared "
                    f"windows (median {o_med:.3f} vs {t_med:.3f} R)"
                ),
            }
        )
    return out


def _merge_deltas(cands: list[dict]) -> list[dict]:
    """Dedupe by change set (plateau + transfer agreeing on a value merge):
    keep the max score, union the evidence."""
    by_key: dict[tuple, dict] = {}
    for c in cands:
        key = _change_key(c["changes"])
        if key not in by_key:
            by_key[key] = c
            continue
        kept = by_key[key]
        winner = c if c["score"] > kept["score"] else kept
        merged_evidence = {e["metric_path"]: e for e in kept["evidence"] + c["evidence"]}
        winner = dict(winner)
        winner["evidence"] = [merged_evidence[k] for k in sorted(merged_evidence)]
        winner["score"] = max(kept["score"], c["score"])
        by_key[key] = winner
    return list(by_key.values())


def generate_candidates(
    *, pack: dict, configs: list[dict], thresholds: InsightsRecommendConfig
) -> list[dict]:
    target_name = str(pack.get("config_name"))
    target_proj = dict(pack.get("knobs") or {})
    family = [
        c for c in configs
        if str(c.get("strategy_id")) == str(pack.get("strategy_id"))
    ]

    # Never-studied target: exactly one honest suggestion (spec edge case).
    if not pack.get("windows"):
        return [
            {
                "klass": "gather_evidence",
                "rank": 1,
                "score": 0.0,
                "changes": [],
                "evidence": [
                    {"metric_path": "health.inputs.window_count", "value": 0},
                ],
                "already_tried": None,
                "narrative_hint": (
                    "this config has never been studied — run a walk-forward "
                    "study so it has out-of-sample windows to judge"
                ),
            }
        ]

    deltas = _merge_deltas(
        _plateau_candidates(pack, thresholds) + _transfer_candidates(pack, thresholds)
    )
    deltas.sort(key=lambda c: (-c["score"], json.dumps(c["changes"], sort_keys=True)))
    deltas = deltas[: thresholds.max_candidates]
    for c in deltas:
        c["already_tried"] = _already_tried(target_proj, c["changes"], configs, target_name)

    out: list[dict] = list(deltas)

    # Thin pack: knob deltas would rest on missing evidence -> name the
    # missing study instead of asserting a delta (FR-007).
    if not deltas and not pack.get("sensitivity"):
        out.append(
            {
                "klass": "gather_evidence",
                "score": 0.0,
                "changes": [],
                "evidence": [
                    {"metric_path": "health.verdict", "value": str((pack.get("health") or {}).get("verdict"))},
                ],
                "already_tried": None,
                "narrative_hint": (
                    "no sensitivity sweep exists for this family — run a "
                    "sensitivity study before trusting any knob delta"
                ),
            }
        )

    # Stop-tuning: every family config has a computed gate and all failed
    # (SC-006). The honest recommendation class must be able to fire.
    gates = {str(g.get("config_name")): g for g in pack.get("gates") or []}
    family_names = sorted(str(c.get("name")) for c in family)
    all_failed = bool(family_names) and all(
        gates.get(n, {}).get("gate_passed") is False for n in family_names
    )
    if all_failed:
        out.append(
            {
                "klass": "stop_tuning",
                "score": 0.0,
                "changes": [],
                "evidence": [
                    {"metric_path": f"gates.{i}.gate_passed", "value": False}
                    for i in range(len(gates))
                ],
                "already_tried": None,
                "narrative_hint": (
                    "every computed pooled gate in this family includes zero — "
                    "no setting shows deployable edge; consider a different "
                    "registered strategy (none exists yet) instead of more tuning"
                ),
            }
        )

    for i, c in enumerate(out):
        c["rank"] = i + 1
        c.setdefault("already_tried", None)
    return out


def assemble_recommendation(
    *,
    config: dict,
    configs: list[dict],
    points: list[dict],
    dist_rows: list[dict],
    surfaces: list[dict],
    regimes: list[dict],
    health_thresholds: InsightsHealthConfig,
    recommend_thresholds: InsightsRecommendConfig,
    trial_counts: dict | None = None,
) -> tuple[dict, list[dict]]:
    """The shared pack+candidates assembly used by both the deterministic
    /api/recommend/pack endpoint and the scope='recommend' Claude payload —
    one builder, no drift."""
    target_points = [p for p in points if p.get("config_name") == config.get("name")]
    gate_row = next(
        (r for r in dist_rows if r.get("config_name") == config.get("name")), None
    )
    health = compute_health(
        config_id=str(config.get("id")),
        config_name=str(config.get("name")),
        strategy_id=str(config.get("strategy_id")) if config.get("strategy_id") else None,
        windows=target_points,
        gate=gate_from_dist_row(gate_row),
        thresholds=health_thresholds,
    )
    pack = build_evidence_pack(
        config=config,
        configs=configs,
        points=points,
        dist_rows=dist_rows,
        surfaces=surfaces,
        regimes=regimes,
        health=health,
        trial_counts=trial_counts,
    )
    candidates = generate_candidates(pack=pack, configs=configs, thresholds=recommend_thresholds)
    return pack, candidates
