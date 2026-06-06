# Data Model: Recommendation Engine (018)

Phase 1 output. Pydantic view models live in `backend/src/intraday_trade_spy/models.py`
(or `storage/models.py` for storage-shaped rows), mirrored as TypeScript types in
`frontend/src/api/types.ts`.

## Computed entities (not persisted)

### HealthVerdict

One per config with OOS history; pure function of archive state (R1).

| Field | Type | Notes |
|---|---|---|
| `config_id` | UUID | |
| `config_name` | str | |
| `strategy_id` | UUID | family key |
| `verdict` | enum `ok \| degrading \| failing \| insufficient_evidence` | ordered rule, R1 |
| `inputs.window_count` | int | cited |
| `inputs.recent_median_r` | float \| null | cited; null when insufficient |
| `inputs.baseline_median_r` | float \| null | cited |
| `inputs.gate_passed` | bool \| null | latest pooled gate; null = never computed |
| `inputs.gate_ci_low/high` | float \| null | cited |
| `thresholds.min_windows` | int | echoed from config.yaml (FR-003) |
| `thresholds.recent_windows` | int | echoed |
| `thresholds.degradation_margin_r` | float | echoed |

**Validation rules**: `verdict=insufficient_evidence` ⇔ `window_count < min_windows`;
`failing` requires `gate_passed == false` and `recent_median_r <= 0`.

### EvidencePack

Assembled per target config (R2); serializes with `sort_keys=True` (it is the
Claude payload and the fingerprint source).

| Field | Type | Notes |
|---|---|---|
| `config_id` / `config_name` | UUID / str | target |
| `health` | HealthVerdict | embedded |
| `windows` | list[WindowPoint] | target's OOS series (range, trades, expectancy_r, net_pnl) |
| `matched` | list[MatchedWindow] | shared `(range_start, range_end)` vs other configs: both expectancy_r values + the registry-knob diff (≤2 knobs) |
| `sensitivity` | list[SurfaceSummary] | per knob axis: values, neighborhood means/variance, current value position, low-confidence mask |
| `regime_bleed` | list[RegimeBleed] | per regime: windows, net_pnl, median expectancy_r |
| `gates` | list[GateRow] | per family config: passed, ci_low/high |
| `trials` | TrialCounts | drafted / validated counts (R5) |
| `snapshot_fingerprint` | str | `_insights_fingerprint` over source rows |

### Candidate (Recommendation)

Deterministic output of `candidates.py` (R3), ranked.

| Field | Type | Notes |
|---|---|---|
| `klass` | enum `knob_delta \| gather_evidence \| stop_tuning` | FR-007 |
| `rank` | int | stable order (score desc, then knob_path/value lexicographic) |
| `score` | float | `improvement_r × log2(1 + evidence_n)` |
| `changes` | list[{knob_path, value}] | knob_delta only; all on `KNOB_REGISTRY`, in bounds (FR-006) |
| `evidence` | list[{metric_path, value}] | cited values resolvable against the pack (SC-003) |
| `already_tried` | {config_id?, config_name} \| null | knob-set match against existing configs |
| `narrative_hint` | str | one deterministic sentence (e.g. "plateau at 2.5–3.0 on risk_reward") |

**Validation rules**: `changes` non-empty ⇔ `klass=knob_delta`;
`already_tried != null` ⇒ no draft action offered; `stop_tuning` present ⇒
every family gate computed and failed (SC-006).

## Persisted entities

### recommendation_trials (NEW — migration `0125_recommendation_trials.sql`)

```sql
CREATE TABLE public.recommendation_trials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id),
  config_id   UUID REFERENCES public.configs(id) ON DELETE SET NULL,
  config_name TEXT NOT NULL,
  analysis_id UUID REFERENCES public.insight_analyses(id) ON DELETE SET NULL,
  source      TEXT NOT NULL CHECK (source IN ('claude', 'deterministic')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX recommendation_trials_family_idx
  ON public.recommendation_trials (user_id, strategy_id, created_at DESC);
-- RLS: enable; user_id = auth.uid() policies for select/insert (mirror 0123)
```

State notes: `config_id` nulls on config deletion while `config_name` keeps
the trail (Principle VII, spec edge case). A trial is **validated** when its
config has a finished walk-forward study (computed by join at read time —
not denormalized). **Trial definition (analyze A1)**: a row is written for
every draft-flow config creation — `source='claude'` when the draft carries
an analysis id (including 017 experiment drafts; the panel is shared),
`source='deterministic'` when drafted from a deterministic candidate card.

### insight_analyses (MODIFIED — same migration)

```sql
ALTER TABLE public.insight_analyses
  DROP CONSTRAINT insight_analyses_scope_check;
ALTER TABLE public.insight_analyses
  ADD CONSTRAINT insight_analyses_scope_check
  CHECK (scope IN ('study', 'insights', 'recommend'));
-- scope='recommend' uses scope_id = configs.id
```

Analysis JSONB schema is unchanged (`ClaudeAnalysis`); sanitation path
unchanged (017).

### configs (UNCHANGED schema; new write path)

Create-config gains optional request fields `provenance.analysis_id` /
`provenance.source`; when present, a `recommendation_trials` row is written
in the same transaction. `description` keeps the 017 human-readable
provenance string.

## Configuration additions (`backend/config/config.yaml`)

```yaml
insights:
  health:
    min_windows: 6
    recent_windows: 4
    degradation_margin_r: 0.02
  recommend:
    min_improvement_r: 0.01
    min_shared_windows: 4
    max_candidates: 5
```

## Frontend types (`frontend/src/api/types.ts`)

`HealthVerdictView`, `EvidencePackView`, `CandidateView`, `TrialCountsView`
mirroring the above; `RecommendPackResponse = { pack, candidates, trial_counts,
snapshot_fingerprint }`.

## Relationships

```
strategies 1─* configs 1─* runs (study children: study_id, window_index, segment)
configs    1─* recommendation_trials *─1 insight_analyses (nullable)
insight_analyses(scope='recommend', scope_id=configs.id)
EvidencePack ──computed-from──> runs + validation_studies(result) + config.yaml regimes + recommendation_trials
```
