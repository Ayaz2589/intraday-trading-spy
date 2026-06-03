# Phase 1 — Data Model: Validation Engine

Covers (a) DB schema changes, (b) backend Python value objects, (c) cloud row/view models. Entities trace to spec Key Entities + FRs.

---

## A. Database schema (Supabase Postgres)

### A1. `validation_studies` (NEW — migration `0110`)

Parent container for a study; mirrors the `backfill_jobs` job pattern.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | UUID FK → `auth.users(id)` | RLS owner |
| `kind` | TEXT | `CHECK (kind IN ('walk_forward','sensitivity','lockbox'))` |
| `status` | TEXT | `CHECK (status IN ('queued','running','finished','failed'))` |
| `status_updated_at` | TIMESTAMPTZ | crash-recovery sweep uses this |
| `params` | JSONB | study inputs: base config name, segment, grid spec / window spec, metric, seed |
| `progress_completed` | INT | evaluations done |
| `progress_total` | INT | evaluations planned (`> 0`) |
| `result` | JSONB NULL | aggregated verdicts (walk-forward / surface / significance) — null until finished |
| `failure_reason` | TEXT NULL | set on `failed` |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

**Indexes:** `(user_id, created_at DESC)`. **RLS:** owner-only (same policy shape as `runs`/`backfill_jobs`).

### A2. `runs` new columns (NEW — migration `0111`)

All nullable so existing standalone runs are unaffected.

| Column | Type | Notes |
|---|---|---|
| `study_id` | UUID NULL FK → `validation_studies(id)` ON DELETE CASCADE | null = standalone run |
| `segment` | TEXT NULL | `CHECK (segment IN ('train','validation','lockbox') OR segment IS NULL)` |
| `window_index` | INT NULL | walk-forward window ordinal; null for sensitivity points / standalone |

**Index:** `(study_id, window_index)` partial `WHERE study_id IS NOT NULL` (study aggregation scans). Existing run indexes/dedup unique key unchanged. Migration `0113` updates the `push_run`/`push_run_finalize` RPCs to read these three keys from the payload and write them.

### A3. `lockbox_ledger` (NEW — migration `0112`)

Append-only; rows are never updated to overwrite a result (immutability — FR-018).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → `auth.users(id)` | RLS owner |
| `lockbox_start` | DATE | held-out segment start |
| `lockbox_end` | DATE | `CHECK (lockbox_end >= lockbox_start)` |
| `config_fingerprint` | TEXT | freeze fingerprint = `compute_spec_hash(strategy, params, symbol, lockbox_start, lockbox_end)` |
| `run_id` | UUID FK → `runs(id)` | the one-shot lockbox child run |
| `result` | JSONB | snapshot of the lockbox run summary at spend time |
| `state` | TEXT | `CHECK (state IN ('spent','burned'))` |
| `override` | BOOLEAN DEFAULT false | true only on a deliberate burn |
| `created_at` | TIMESTAMPTZ DEFAULT now() | spend/burn time |

**Index:** `(user_id, lockbox_start, lockbox_end, created_at)`. **No UPDATE/DELETE** in application paths — only INSERT + SELECT. **RLS:** owner-only. *Derived state:* the lockbox's current status for a (user, range) = the latest row; `spent` until any `burned` row appears, then permanently `burned`.

---

## B. Backend Python value objects (`models.py`, frozen Pydantic unless noted)

### B1. Window evaluation outputs

```python
class WindowMetrics(BaseModel):           # the subset of SummaryMetrics we compare across windows
    segment: Literal["train","validation","lockbox"]
    range_start: date
    range_end: date
    run_id: str                            # child run for drill-down
    total_trades: int
    expectancy_dollars: float | None
    expectancy_r: float | None
    win_rate: float
    profit_factor: float | None
    sharpe: float | None
    total_net_pnl_dollars: float
    low_confidence: bool                   # reuses Phase 1 threshold

class WalkForwardWindowResult(BaseModel):
    window_index: int
    in_sample: WindowMetrics               # training window
    out_of_sample: WindowMetrics           # next untouched window
    gap: dict[str, float | None]           # OOS − IS per compared metric

class WalkForwardResult(BaseModel):
    mode: Literal["rolling","anchored"]
    train_months: int
    step_months: int
    validation_months: int
    windows: list[WalkForwardWindowResult]
    mean_oos: dict[str, float | None]
    mean_gap: dict[str, float | None]
```

### B2. Sensitivity surface

```python
class SensitivityPoint(BaseModel):
    coords: dict[str, float]               # {dotted_knob_path: value}
    metric: float | None
    trade_count: int
    low_confidence: bool
    run_id: str

class SensitivitySurface(BaseModel):
    metric_name: str                       # e.g. "expectancy_dollars"
    knobs: list[str]                        # 1 or 2 dotted paths (axis order)
    axes: dict[str, list[float]]           # knob → ordered value list
    points: list[SensitivityPoint]
    segment: Literal["train","validation","train_validation"]
```

### B3. Significance

```python
class BootstrapCI(BaseModel):
    statistic: str                         # "expectancy_dollars" | "expectancy_r" | "sharpe"
    point: float | None
    low: float | None
    high: float | None

class SignificanceResult(BaseModel):
    confidence: float                      # 0.95
    bootstrap: list[BootstrapCI]
    permutation_metric: str                # "total_net_pnl_dollars" (default)
    observed: float
    p_value: float | None
    alpha: float                           # 0.05
    significant: bool                      # p_value < alpha
    bootstrap_iterations: int
    permutation_iterations: int
    seed: int
```

### B4. Lockbox

```python
class LockboxStatus(BaseModel):
    lockbox_start: date
    lockbox_end: date
    state: Literal["unspent","spent","burned"]
    config_fingerprint: str | None         # the config that spent it (if any)
    run_id: str | None
    result: SummaryMetrics | None
    history: list[dict]                     # append-only attempts (fingerprint, state, override, created_at)
```

### B5. Config models (`config.py`)

```python
class SplitWindowConfig(BaseModel):  start: date; end: date
class SplitConfig(BaseModel):        train: SplitWindowConfig; validation: SplitWindowConfig; lockbox: SplitWindowConfig
class WalkForwardConfig(BaseModel):
    mode: Literal["rolling","anchored"] = "rolling"
    train_months: int = 12
    step_months: int = 6
    validation_months: int = 6
    overfit_gap_warn: float = ...          # default gap threshold to paint a window (decided in tasks.md)
class SensitivityConfig(BaseModel):  default_metric: str = "expectancy_dollars"; max_grid_points_warn: int = 50
class SignificanceConfig(BaseModel):
    bootstrap_iterations: int = 1000
    permutation_iterations: int = 1000
    confidence: float = 0.95
    alpha: float = 0.05
    seed: int = 20260603
class ValidationConfig(BaseModel):
    split: SplitConfig
    walk_forward: WalkForwardConfig = WalkForwardConfig()
    sensitivity: SensitivityConfig = SensitivityConfig()
    significance: SignificanceConfig = SignificanceConfig()
    max_evaluations_warn: int = 200
# Config gains: validation: ValidationConfig
```

---

## C. Cloud row & view models (`storage/models.py`, `api/schemas.py`)

```python
# storage/models.py
class ValidationStudyRow(BaseModel):
    id, user_id, kind, status, status_updated_at, params: dict,
    progress_completed: int, progress_total: int, result: dict | None,
    failure_reason: str | None, created_at
class LockboxLedgerRow(BaseModel):
    id, user_id, lockbox_start: date, lockbox_end: date, config_fingerprint: str,
    run_id, result: dict, state: Literal["spent","burned"], override: bool, created_at
# RunRow gains: study_id: UUID | None, segment: str | None, window_index: int | None

# api/schemas.py (response views)
class ValidationStudyView(BaseModel):
    id, kind, status, progress_completed, progress_total,
    result: dict | None, failure_reason: str | None, created_at
class ValidationStudyStatusView(BaseModel):
    id, status, progress_completed, progress_total, failure_reason: str | None
class LockboxStatusView(BaseModel):     # mirrors LockboxStatus B4
    lockbox_start, lockbox_end, state, config_fingerprint, run_id, result, history
```

---

## D. State transitions

**Study:** `queued → running → finished` (success) or `queued → running → failed` (exception; `failure_reason` set; partial child runs remain inspectable). Stale `running` studies older than the polling-max-age are swept to `failed` on startup.

**Lockbox (per user, per lockbox range):** `unspent → spent` (first freeze+run) → `burned` (a different config run with `override=true`). `spent + same fingerprint` is idempotent (no transition). `spent + different fingerprint + override=false` is **rejected** (no transition, 409). `burned` is terminal.

---

## E. Validation rules (enforced + tested)

- A non-lockbox study's `[range_start, range_end]` MUST NOT intersect the lockbox segment (`split.assert_no_lockbox_overlap`).
- Walk-forward windows MUST all end ≤ the validation-segment end and MUST NOT enter the lockbox.
- `progress_total > 0`; grid/window enumeration that implies `> max_evaluations_warn` evaluations requires `confirm_large=true`.
- Sensitivity grids are 1-D or 2-D only (≥3-D rejected).
- All randomness derives from `significance.seed`; identical (inputs, seed) ⇒ identical CI bounds, p-value, verdict.
- Lockbox `result` rows are append-only and never overwritten.
