"""Feature 018 (US1): the config health verdict — a pure, deterministic
function of the OOS archive (FR-001). No randomness, no wall clock, no LLM:
identical inputs always reproduce identical output (SC-002).

Ordered rule (research R1; thresholds from config.yaml, FR-003):

  1. insufficient_evidence  when usable windows < min_windows
  2. failing                when the latest pooled gate failed AND the recent
                            median expectancy R <= 0
  3. degrading              when recent median < baseline median - margin
  4. ok                     otherwise

Every verdict ships its cited inputs and the thresholds used (FR-002)."""

from __future__ import annotations

from statistics import median

from intraday_trade_spy.config import InsightsHealthConfig

VERDICT_OK = "ok"
VERDICT_DEGRADING = "degrading"
VERDICT_FAILING = "failing"
VERDICT_INSUFFICIENT = "insufficient_evidence"

# Strict-comparison epsilon: float noise (e.g. median(0.01, 0.05) - 0.02
# landing 2e-18 above 0.01) must never flip a verdict at the boundary.
_EPS = 1e-9


def compute_health(
    *,
    config_id: str,
    config_name: str,
    strategy_id: str | None,
    windows: list[dict],
    gate: dict | None,
    thresholds: InsightsHealthConfig,
) -> dict:
    """Verdict for one config. `windows` are edge-timeseries points for this
    config (any order); `gate` is the latest pooled-gate fields or None."""
    # Usable = windows that actually measured an expectancy; chronological
    # order with run_id as the total-order tiebreaker (determinism).
    usable = sorted(
        (w for w in windows if w.get("expectancy_r") is not None),
        key=lambda w: (str(w.get("range_start")), str(w.get("run_id"))),
    )
    count = len(usable)

    gate_passed = gate.get("passed") if gate else None
    gate_ci_low = gate.get("ci_low") if gate else None
    gate_ci_high = gate.get("ci_high") if gate else None

    recent_median: float | None = None
    baseline_median: float | None = None

    if count < thresholds.min_windows:
        verdict = VERDICT_INSUFFICIENT
    else:
        values = [float(w["expectancy_r"]) for w in usable]
        recent_median = float(median(values[-thresholds.recent_windows :]))
        baseline_median = float(median(values))
        if gate_passed is False and recent_median <= _EPS:
            verdict = VERDICT_FAILING
        elif recent_median < baseline_median - thresholds.degradation_margin_r - _EPS:
            verdict = VERDICT_DEGRADING
        else:
            verdict = VERDICT_OK

    return {
        "config_id": config_id,
        "config_name": config_name,
        "strategy_id": strategy_id,
        "verdict": verdict,
        "inputs": {
            "window_count": count,
            "recent_median_r": recent_median,
            "baseline_median_r": baseline_median,
            "gate_passed": gate_passed,
            "gate_ci_low": gate_ci_low,
            "gate_ci_high": gate_ci_high,
        },
        "thresholds": {
            "min_windows": thresholds.min_windows,
            "recent_windows": thresholds.recent_windows,
            "degradation_margin_r": thresholds.degradation_margin_r,
        },
    }


def gate_from_dist_row(row: dict | None) -> dict | None:
    """The latest pooled-gate fields as the distribution aggregate exposes
    them; None when no gate has ever been computed for the config."""
    if not row or row.get("gate_passed") is None:
        return None
    return {
        "passed": row.get("gate_passed"),
        "ci_low": row.get("gate_ci_low"),
        "ci_high": row.get("gate_ci_high"),
    }


def health_for_configs(
    *,
    configs: list[dict],
    points: list[dict],
    dist_rows: list[dict],
    thresholds: InsightsHealthConfig,
) -> list[dict]:
    """Verdicts for every config with any OOS history, ordered by config name
    (deterministic). Configs with zero history are omitted (the spec's
    'insufficient' state still requires at least one measured window —
    a never-studied config gets its guidance from US2's gather-evidence)."""
    by_name: dict[str, list[dict]] = {}
    for p in points:
        name = p.get("config_name")
        if name is not None:
            by_name.setdefault(name, []).append(p)
    gates = {r.get("config_name"): r for r in dist_rows}

    out: list[dict] = []
    for cfg_row in sorted(configs, key=lambda c: str(c.get("name"))):
        name = cfg_row.get("name")
        windows = by_name.get(name)
        if not windows:
            continue
        out.append(
            compute_health(
                config_id=str(cfg_row.get("id")),
                config_name=str(name),
                strategy_id=str(cfg_row.get("strategy_id")) if cfg_row.get("strategy_id") else None,
                windows=windows,
                gate=gate_from_dist_row(gates.get(name)),
                thresholds=thresholds,
            )
        )
    return out
