"""Feature 018 (US2): evidence-pack assembly — exclusively from artifacts the
system already persists (FR-005): OOS window points (validation segment only,
FR-012), pooled-gate rows, sensitivity surfaces, config.yaml regimes, and the
trial ledger. Pure and deterministic: same inputs serialize byte-identically
and fingerprint identically (SC-002)."""

from __future__ import annotations

import hashlib
import json
from statistics import median

from intraday_trade_spy.validation.knobs import KNOB_REGISTRY

_EPS = 1e-9


def _dig(params: dict | None, dotted: str):
    cur: object = params or {}
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def knob_projection(params: dict | None) -> dict[str, float]:
    """A config's registry-knob values (paths present in params only) — the
    canonical identity used for diffs and already-tried detection (FR-006)."""
    out: dict[str, float] = {}
    for path in KNOB_REGISTRY:
        v = _dig(params, path)
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            continue
        out[path] = float(v)
    return out


def _target_windows(points: list[dict], target_name: str) -> list[dict]:
    rows = [
        {
            "range_start": str(p.get("range_start")),
            "range_end": str(p.get("range_end")),
            "trades": int(p.get("trades") or 0),
            "net_pnl": float(p.get("net_pnl") or 0.0),
            "expectancy_r": float(p["expectancy_r"]) if p.get("expectancy_r") is not None else None,
        }
        for p in points
        if p.get("config_name") == target_name
    ]
    rows.sort(key=lambda w: (w["range_start"], w["range_end"]))
    return rows


def _matched(
    *, target_name: str, target_proj: dict, points: list[dict], family: dict[str, dict]
) -> list[dict]:
    """Shared-validation-window comparisons vs other family configs, with the
    registry-knob diff (transfer-eligible when 1-2 knobs differ)."""
    by_range: dict[tuple[str, str], dict[str, dict]] = {}
    for p in points:
        name = p.get("config_name")
        if name not in family:
            continue
        key = (str(p.get("range_start")), str(p.get("range_end")))
        by_range.setdefault(key, {})[str(name)] = p

    projections = {name: knob_projection(cfg.get("params")) for name, cfg in family.items()}

    rows: list[dict] = []
    for start, end in sorted(by_range):
        group = by_range[(start, end)]
        t = group.get(target_name)
        if not t or t.get("expectancy_r") is None:
            continue
        for other_name in sorted(group):
            if other_name == target_name:
                continue
            o = group[other_name]
            if o.get("expectancy_r") is None:
                continue
            op = projections.get(other_name, {})
            diff = [
                {
                    "knob_path": path,
                    "target_value": target_proj[path],
                    "other_value": op[path],
                }
                for path in sorted(set(target_proj) & set(op))
                if abs(target_proj[path] - op[path]) > _EPS
            ]
            eligible = 1 <= len(diff) <= 2
            rows.append(
                {
                    "range_start": start,
                    "range_end": end,
                    "other_config": other_name,
                    "target_expectancy_r": float(t["expectancy_r"]),
                    "other_expectancy_r": float(o["expectancy_r"]),
                    "knob_diff": diff if eligible else (diff or None),
                    "transfer_eligible": eligible,
                }
            )
    return rows


def _sensitivity(
    surfaces: list[dict], family_names: set[str], target_proj: dict
) -> list[dict]:
    """1-D registry-knob surfaces summarized per grid value: raw metric +
    neighborhood mean over value±1 (low-confidence points excluded — research
    R3's plateau-over-peak preference falls out of the neighborhood mean)."""
    out: list[dict] = []
    for s in surfaces:
        if s.get("config_name") not in family_names:
            continue
        surf = s.get("surface") or {}
        knobs = surf.get("knobs") or []
        if len(knobs) != 1 or knobs[0] not in KNOB_REGISTRY:
            continue
        path = knobs[0]
        axis = sorted(float(v) for v in (surf.get("axes") or {}).get(path, []))
        pts: dict[float, dict] = {}
        for p in surf.get("points") or []:
            coords = p.get("coords") or {}
            if path in coords:
                pts[float(coords[path])] = p

        values = []
        for i, v in enumerate(axis):
            nb = []
            for j in (i - 1, i, i + 1):
                if 0 <= j < len(axis):
                    q = pts.get(axis[j])
                    if q and not q.get("low_confidence") and q.get("metric") is not None:
                        nb.append(float(q["metric"]))
            p = pts.get(v) or {}
            values.append(
                {
                    "value": v,
                    "metric": float(p["metric"]) if p.get("metric") is not None else None,
                    "low_confidence": bool(p.get("low_confidence", False)),
                    "neighborhood_mean": (sum(nb) / len(nb)) if nb else None,
                    "evidence_n": len(nb),
                }
            )
        out.append(
            {
                "study_id": str(s.get("study_id")),
                "config_name": s.get("config_name"),
                "knob_path": path,
                "metric_name": surf.get("metric_name"),
                "current_value": target_proj.get(path),
                "values": values,
            }
        )
    out.sort(key=lambda x: (x["knob_path"], x["study_id"]))
    return out


def _regime_bleed(target_windows: list[dict], regimes: list[dict]) -> list[dict]:
    out = []
    for r in regimes:
        start, end = str(r.get("start")), str(r.get("end"))
        wins = [
            w for w in target_windows
            if w["range_start"] <= end and w["range_end"] >= start
        ]
        rvals = [w["expectancy_r"] for w in wins if w["expectancy_r"] is not None]
        out.append(
            {
                "regime": r.get("name"),
                "windows": len(wins),
                "net_pnl": float(sum(w["net_pnl"] for w in wins)),
                "median_expectancy_r": float(median(rvals)) if rvals else None,
            }
        )
    return out


def pack_fingerprint(pack: dict) -> str:
    """Snapshot pin for the pack — recompute-identical for identical inputs;
    the analyst's payload_hash builds on top of the same canonical dump."""
    src = {k: v for k, v in pack.items() if k != "snapshot_fingerprint"}
    blob = json.dumps(src, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def build_evidence_pack(
    *,
    config: dict,
    configs: list[dict],
    points: list[dict],
    dist_rows: list[dict],
    surfaces: list[dict],
    regimes: list[dict],
    health: dict,
    trial_counts: dict | None = None,
) -> dict:
    """The single deterministic input to candidate generation AND the Claude
    payload for scope='recommend'. Assembly is read-only joins — no backtests
    are ever executed here (FR-005)."""
    target_name = str(config.get("name"))
    strategy_id = config.get("strategy_id")
    family = {
        str(c.get("name")): c
        for c in configs
        if str(c.get("strategy_id")) == str(strategy_id)
    }
    family_names = set(family)
    target_proj = knob_projection(config.get("params"))
    windows = _target_windows(points, target_name)

    gates = sorted(
        (
            {
                "config_name": r.get("config_name"),
                "gate_passed": r.get("gate_passed"),
                "gate_ci_low": r.get("gate_ci_low"),
                "gate_ci_high": r.get("gate_ci_high"),
            }
            for r in dist_rows
            if r.get("config_name") in family_names
        ),
        key=lambda g: str(g["config_name"]),
    )

    pack = {
        "config_id": str(config.get("id")),
        "config_name": target_name,
        "strategy_id": str(strategy_id) if strategy_id is not None else None,
        "health": health,
        "knobs": target_proj,
        "windows": windows,
        "matched": _matched(
            target_name=target_name, target_proj=target_proj, points=points, family=family
        ),
        "sensitivity": _sensitivity(surfaces, family_names, target_proj),
        "regime_bleed": _regime_bleed(windows, regimes),
        "gates": gates,
        "trial_counts": trial_counts or {"drafted": 0, "validated": 0},
    }
    pack["snapshot_fingerprint"] = pack_fingerprint(pack)
    return pack
