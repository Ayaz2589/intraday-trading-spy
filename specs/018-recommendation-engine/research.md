# Research: Recommendation Engine (018)

Phase 0 output. Every decision below was grounded against the current code
(file:line refs from exploration on 2026-06-05, branch `018-recommendation-engine`).

## R1 — Health verdict: inputs, rule, and thresholds

**Decision**: Health is a pure function
`health(windows, latest_gate, thresholds) → verdict + cited inputs`, computed
in `recommend/health.py` from data the storage layer already aggregates:

- *Windows*: the per-config validation-segment window series already produced
  by `insights_edge_timeseries()` (`storage/client.py:1496-1558`) — one point
  per OOS window with `expectancy_r`, `trades`, `range_start/end`.
- *Latest gate*: the per-config pooled-gate verdict already surfaced by
  `insights_config_distribution()` (`storage/client.py:1560-1668`).

Rule (evaluated in order; all values from config):

1. `insufficient_evidence` if window count < `min_windows`.
2. `failing` if the latest pooled gate exists and failed **and** the median
   expectancy R of the most recent `recent_windows` windows ≤ 0.
3. `degrading` if recent median expectancy R < (all-windows median −
   `degradation_margin_r`).
4. `ok` otherwise.

Thresholds in `backend/config/config.yaml` under a new block:

```yaml
insights:
  health:
    min_windows: 6          # evidence floor (verdict refuses below this)
    recent_windows: 4       # the "recent" comparison window count
    degradation_margin_r: 0.02   # R-units margin before degrading fires
```

Cited inputs shipped with every verdict: window count, recent median R,
baseline median R, margin, gate status + CI, threshold values used (FR-002,
FR-003).

**Rationale**: Reuses the two existing aggregates (no new SQL for US1);
medians over means resist single-window outliers; the ordered rule makes the
verdict total and unambiguous; "seeded" in the spec is satisfied by
determinism-by-construction — there is no randomness to seed, which is
strictly stronger.

**Alternatives considered**: (a) Rolling Sharpe of window PnL — rejected:
window counts are small (often < 12), Sharpe over n=4 is noise theater.
(b) Persisting verdicts in a table — rejected: verdicts are cheap pure
functions of persisted state; persisting invites staleness bugs (the 016
fingerprint precedent says compute-and-pin, don't cache-and-drift).
(c) Per-day equity drawdown triggers — rejected: out of scope; the archive's
unit of honesty is the OOS window, not the day.

## R2 — Evidence pack: sources and assembly

**Decision**: `recommend/evidence.py` assembles a single JSON-serializable
`EvidencePack` per config from five already-persisted sources plus the new
ledger:

| Source | Where it already lives |
|---|---|
| OOS window series (all configs) | `insights_edge_timeseries()` rows |
| Distribution + gates | `insights_config_distribution()` rows |
| Sensitivity surfaces | `validation_studies.result` where `kind='sensitivity'` — `SensitivitySurface{knobs[], axes{}, points[{coords, metric, trade_count, low_confidence}]}` (`models.py:266-283`) |
| Matched-window comparisons | edge-timeseries rows grouped by `(range_start, range_end)` across configs — child runs already carry window identity (migration 0111) |
| Regime bleed | edge-timeseries rows intersected with `data.regimes` from `config.yaml:28-32` |
| Trial ledger count | new `recommendation_trials` table (R5) |

Matched-window comparison: for each window range shared by the target config
and another config, the pack records both configs' expectancy R; a knob-level
transfer signal exists when the other config differs on exactly one or two
registry knobs (computed from `configs.params` JSONB diff restricted to
`KNOB_REGISTRY` paths).

The pack carries a `snapshot_fingerprint` reusing the existing
`_insights_fingerprint` mechanism over its source rows, giving recommend
analyses the same pin/stale semantics as 016 (`client.py:1557`).

**Rationale**: FR-005 requires assembly exclusively from persisted artifacts —
every row above exists today; assembly is read-only joins in Python over
≤ thousands of rows. Restricting knob diffs to the registry keeps transfer
signals inside the whitelisted space by construction.

**Alternatives considered**: (a) New SQL mega-aggregate for the whole pack —
rejected: the two existing aggregates + one sensitivity fetch cover it;
premature optimization at this scale. (b) Including raw trades — rejected:
packs feed prompts and UI; window-level granularity is the spec's unit.

## R3 — Candidate generation and deterministic ranking

**Decision**: `recommend/candidates.py` emits candidates in three classes
(FR-007) with a documented, stable scoring rule:

- **knob_delta** sources:
  1. *Plateau move* (from sensitivity surfaces): for each 1-D axis of a
     surface on a registry knob, compute for every grid value the
     neighborhood mean metric (value + immediate neighbors). Candidate =
     grid value whose neighborhood mean exceeds the config's current
     value's neighborhood mean by ≥ `min_improvement` (config), preferring
     plateaus (low neighbor variance) over peaks. Points flagged
     `low_confidence` are excluded from neighborhoods.
  2. *Cross-config transfer* (from matched windows): if another config
     differing on ≤ 2 registry knobs has a higher median expectancy R
     across ≥ `min_shared_windows` shared windows, each differing knob's
     value is a candidate.
- **gather_evidence**: emitted when (a) the config has no walk-forward
  study (verdict path), or (b) a knob would otherwise be suggested but has
  no sensitivity surface and no transfer evidence — the recommendation
  names the missing study (FR-007, edge case "thin pack").
- **stop_tuning**: emitted when every config in the family (same
  `strategy_id`) has a computed pooled gate and all failed (SC-006). Text
  notes whether another registered strategy exists (today: none).

Score: `score = improvement_r × log2(1 + evidence_n)` where `improvement_r`
is the neighborhood/median improvement in R units and `evidence_n` is grid
points or shared windows backing it. Ties break by `(knob_path, value)`
lexicographic. Sorting is `sorted(..., key=...)` (stable) → identical packs
yield identical rankings (SC-002).

Already-tried detection: a candidate's resulting knob set (current
`configs.params` + delta, canonicalized) is compared against every existing
config's registry-knob projection; on match the candidate is flagged
`already_tried` with that config's name and never offered as a draft
(FR-006).

New config block:

```yaml
insights:
  recommend:
    min_improvement_r: 0.01
    min_shared_windows: 4
    max_candidates: 5
```

**Rationale**: Both candidate sources are *evidence transformations*, not
searches — they only surface settings the archive has actually measured,
which is what "recommendations are hypotheses for the validation machinery"
means in practice. The log evidence weight prevents one lucky window pair
from outranking a well-sampled plateau.

**Alternatives considered**: (a) Grid search / optimizer proposing untested
values — rejected: violates FR-005's no-new-backtests boundary and invites
the optimizer-overfit spiral the constitution exists to prevent.
(b) Bayesian scoring — rejected: opaque to the educational UI; the score
above is explainable in one tooltip sentence.

## R4 — Advisory layer: scope='recommend' on the existing analyst

**Decision**: Extend `claude_analyst.py` (scopes today: `'insights'`,
`'study'` at lines 219-235) with `scope='recommend'`, `scope_id = config id`:

- Payload = the EvidencePack (already JSON) → same SHA-256 `payload_hash`
  pinning and idempotency (`claude_analyst.py:117-119, 237-242`).
- Output schema unchanged (`ClaudeAnalysis`); `suggested_experiments[].
  suggested_config_changes` pass through the existing
  `_sanitize_experiments()` → `sanitize_changes()` whitelist
  (`claude_analyst.py:198-206`, `validation/knobs.py:46-69`) (FR-008).
- The prompt for the scope includes the deterministic candidates, the trial
  count, and the registry bounds (017 already injects the registry), and
  instructs ranking/commentary over *provided* candidates — not invention.
- Billing pause and settings reuse `insight_settings` unchanged.
- Migration 0125 widens the `insight_analyses.scope` CHECK to
  `('study','insights','recommend')`.

The deterministic surfaces (`/api/recommend/*`) never call the analyst —
FR-009 falls out of the architecture rather than a runtime flag.

**Rationale**: One provider integration, one sanitation path, one pause
switch — exactly the 017 trust chain, extended not duplicated. Reusing
`POST /api/insights/claude-analysis` for generation means zero new
Claude-facing endpoints.

**Alternatives considered**: A separate recommender prompt/client module —
rejected: duplicates sanitation and pause logic; divergence there is a
safety bug waiting to happen.

## R5 — Trial ledger: durable, deletion-surviving counts

**Decision**: New table in migration `0125_recommendation_trials.sql`:

```sql
CREATE TABLE public.recommendation_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id),
  config_id UUID REFERENCES public.configs(id) ON DELETE SET NULL,
  config_name TEXT NOT NULL,           -- survives config deletion
  analysis_id UUID REFERENCES public.insight_analyses(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('claude', 'deterministic')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS mirroring 0123; index (user_id, strategy_id, created_at DESC)
```

A row is written transactionally when a config is created through the draft
flow carrying recommendation provenance: the existing create-config request
gains optional `provenance` fields (`analysis_id?`, `source?`) populated by
the 017 draft transport (which already carries `analysis_id`). The panel
shows `drafted` (ledger rows) and `validated` (ledger rows whose config has a
finished walk-forward study) counts; the pack embeds both (FR-011).

**Rationale**: The spec requires counts that survive config deletion —
deriving from `configs.description` dies with the row; `ON DELETE SET NULL`
plus the denormalized `config_name` keeps the audit trail (Principle VII).
Family = `strategy_id` per the spec's assumption.

**Alternatives considered**: (a) Deriving counts from description-text
provenance — rejected: not deletion-proof, string-parsing fragility.
(b) Counting every config creation as a trial — rejected: the ledger's
meaning is *recommendation-originated* attempts; manual exploration is the
operator's business.

## R6 — API surface

**Decision**: New router `api/routers/recommend.py`:

- `GET /api/recommend/health` → `[{config_id, config_name, verdict, inputs{…}, thresholds{…}}]` for all configs with any OOS history.
- `GET /api/recommend/pack?config_id=…` → `{pack, candidates[], trial_counts, snapshot_fingerprint}` (deterministic; no Claude).
- Claude generation/readback reuses the existing
  `POST/GET /api/insights/claude-analysis` with `scope='recommend'`,
  `scope_id=config_id`.
- Create-config provenance: optional `provenance{analysis_id?, source}` on
  the existing create endpoint writes the ledger row.

**Rationale**: Smallest honest surface; the split mirrors the determinism
split the UI must display (FR-013): `/api/recommend/*` is the seeded side,
`/api/insights/claude-analysis` is the advisory side.

## R7 — Frontend composition

**Decision**:

- `components/recommend/HealthBadge.tsx` — verdict → badge variant
  (ok=profit, degrading=warn, failing=loss, insufficient=faint) + cited
  inputs in a `HelpTooltip`-paired title; mounted in
  `config-list.tsx`'s active `ConfigRow` (`config-manager.tsx:24` owns the
  list) and in the panel rows.
- `components/recommend/RecommendationsPanel.tsx` — on the Insights page
  below `ClaudeReadCard`: per-config verdict rows, trial-ledger line
  ("N drafted · M validated against this archive"), generate button, and
  `RecommendationCard`s.
- `components/recommend/RecommendationCard.tsx` — class-specific rendering;
  knob deltas reuse the 017 chip style and `encodeDraft()` transport
  (`lib/draft-config.ts`) for "Draft config →"; `already_tried` renders the
  flag + link instead of the draft button; deterministic cards render
  without any analysis present (FR-009).
- `hooks/useRecommend.ts` + `api/recommend.ts` follow the
  `useInsights`/`api/insights.ts` pattern verbatim.
- Four new `HelpContentKey` entries: `health_verdict`,
  `recommendation_classes`, `evidence_pack`, `trial_count` — the /docs
  glossary (built from `HELP_CONTENT`) inherits them automatically.

**Rationale**: Every piece lands in an established pattern (hooks, chips,
draft transport, badges, design-system classes from the redesign) — the
feature adds concepts, not conventions.

## R8 — Determinism verification strategy

**Decision**: Tests enforce SC-002 directly: property-style unit tests call
`health()` / `rank_candidates()` twice on identical inputs and assert
byte-identical serialized output; storage tests assert aggregates order
deterministically (existing ORDER BY discipline); no `datetime.now()`,
`random`, or dict-iteration-order dependence in `recommend/` (packs serialize
with `sort_keys=True`, matching the analyst's hashing).

**Rationale**: Determinism is the feature's load-bearing promise; it gets the
same test-gate treatment the constitution gives look-ahead bias.
