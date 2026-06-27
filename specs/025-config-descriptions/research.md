# Phase 0 Research: Human-Readable Config Descriptions

No NEEDS CLARIFICATION markers remained after specify (scope locked with requester). Research here
records the design decisions that resolve the "how", grounded in the existing codebase.

## Decision 1 — Where the summary is computed

**Decision**: A new pure module `backend/src/intraday_trade_spy/config_summary.py` exposing
`summarize_config(params: dict) -> ConfigSummary`. `ConfigView` (Pydantic v2) gains two
`@computed_field`s (`summary`, `highlights`) that call it from `self.params`.

**Rationale**: `ConfigView` is the single serialization point for configs and is embedded by
`RunManifestView.config` too. Computed fields make the summary appear on *every* config response
(configs list, run manifest, future surfaces) with no per-router wiring — directly satisfying FR-006
and the "appears everywhere" intent, while keeping derivation logic in one tested pure module.

**Alternatives considered**:
- *Compute in the configs router only* — would miss other surfaces and duplicate logic. Rejected.
- *Store a generated column / cache* — violates the locked "no migration / store nothing" scope
  (FR-009) and adds an invalidation problem for zero benefit at this scale. Rejected.

## Decision 2 — Wording source

**Decision**: Reuse `validation/knobs.py::KNOB_REGISTRY` `KnobSpec.label` as the source of the
human-readable label for each `highlight`, and craft compact value phrasings in `config_summary.py`.

**Rationale**: FR-004 requires consistency with the established vocabulary. The registry already
carries operator-facing labels (`"stop buffer (%)"`, `"risk:reward target"`, `"max distance from
VWAP (%)"`, `"opening range (minutes)"`, entry-window labels) and bounds. Reusing it means summary
wording can't drift from the rest of the product, and the "full window" threshold can be derived from
the registry's bound rather than a literal.

**Alternatives considered**:
- *Hand-write a parallel label map* — duplicates the registry, invites drift. Rejected.

## Decision 3 — Which knobs the summary highlights, and in what order

**Decision**: The one-line summary leads with the strategy family ("VWAP pullback") then the
strategy-defining knobs in a fixed order: max distance from VWAP → stop buffer → risk:reward →
opening range → entry window. Risk-management knobs (account value, max risk per trade, max position
value, max consecutive losses) are **not** in the one-line summary (kept concise per the
salient-subset assumption) but MAY appear in `highlights` if desired — for v1, `highlights` mirrors
the same salient strategy knobs to keep the chip layout focused.

**Rationale**: These five knobs define how the strategy enters/exits and are what differ across the
auto-generated configs (SC-002 — two materially different configs must read differently). Fixed
ordering guarantees determinism (FR-002).

**Alternatives considered**:
- *Dump every param* — noisy, unreadable in a list row (edge case "very long summary"). Rejected.

## Decision 4 — Value phrasings (deterministic, human terms)

**Decision** (FR-012):
- Percent knobs (`buffer_pct`, `max_distance_from_vwap_pct`) → trimmed percent string, e.g. `0.2%`,
  with `max_distance_from_vwap_pct` prefixed `≤` ("≤0.5% from VWAP").
- `risk_reward` → `N:1 R:R` ratio form, e.g. `2:1 R:R` (formatted from the float; `2.0` → `2:1`,
  `1.5` → `1.5:1`).
- `opening_range.minutes` → `15-min opening range`.
- Entry window → `all-day entry` when `start <= window_min_bound` AND `end >= window_max_bound`
  (bounds read from `KNOB_REGISTRY` entry-window specs); otherwise an explicit
  `entry MM–MM min` range.

**Rationale**: Matches the example in the spec and reads naturally. Number formatting trims trailing
zeros so output is stable and clean.

**Alternatives considered**:
- *Raw numbers* (`buffer 0.2`) — fails FR-012 (no context/units). Rejected.

## Decision 5 — Robustness (total function)

**Decision**: `summarize_config` walks a fixed list of "highlighters", each safely reading a nested
path from `params`. Missing keys are skipped; a non-dict/empty `params` yields a minimal summary of
just the strategy family ("VWAP pullback"). Unknown params are never echoed. The function never
raises (FR-007, SC-006).

**Rationale**: Configs in the wild have heterogeneous params (auto-generated vs hand-made). Mirrors
the defensive, total style already used by `sanitize_changes` in the same registry module.

## Decision 6 — Frontend rendering

**Decision**: A small presentational `config-summary.tsx` renders the one-line `summary` (default) or
a chip row from `highlights`. `config-list.tsx` shows it under the technical name with a `HelpTooltip`
(US3/FR-010). `strategy-config-dropdown.tsx` shows the summary line per option / on the trigger.

**Rationale**: One presentational component keeps the two surfaces consistent and independently
testable. The technical name stays as the durable identifier (FR-005).

**Alternatives considered**:
- *Replace the name with the summary* — breaks FR-005 (name is referenced by runs/studies). Rejected.
