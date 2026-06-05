# Data Model — Study Child-Run Persistence + Drill-Down

**Zero schema migrations.** Every column this feature needs already exists; the
feature starts *writing* columns that were created (and left empty) by 011/012.

## Existing tables (columns used, no DDL)

### `runs` (0003 + 0090/0091/0092 + 0111 + 0121)

| Column | Used how (new in 014) |
|---|---|
| `study_id UUID NULL` → FK `validation_studies(id) ON DELETE CASCADE` | **written** for orchestrator-created children; stays NULL for standalone + dedup-referenced runs |
| `segment TEXT NULL CHECK IN ('train','validation','lockbox')` | **written**: `train` (IS), `validation` (OOS / sensitivity segment), `lockbox` |
| `window_index INTEGER NULL CHECK ≥ 0` | **written**: walk-forward window index; sensitivity grid-point ordinal; NULL for lockbox |
| `spec_hash TEXT NULL` | **written** per child (dedup key, as standalone runs do) |
| `config_snapshot JSONB NULL` | **written** per child: effective risk+strategy knobs for that evaluation (sensitivity: base config merged with grid-point overrides) |
| `summary`, `data_fingerprint`, trades/signals/journal child rows | written via the same `push_run(jsonb)` RPC as standalone runs |

**Invariants**
- Walk-forward children carry `segment IN ('train','validation')`. Sensitivity
  children over a single segment carry that segment; over the combined
  `train_validation` range they carry **`segment = NULL`** — the 0111 CHECK
  only allows NULL/'train'/'validation'/'lockbox', and 0111's header comment
  documents exactly this resolution. The true segment label always lives in the
  study's result JSON (`SensitivitySurface.segment`), so nothing is lost.
- `window_index` is set for walk-forward and sensitivity children, NULL for the
  lockbox child (which has `study_id IS NULL`, `segment='lockbox'`).
- Deleting a study cascades to its children (existing FK); runs a study merely
  *referenced* via dedup are untouched (their `study_id` belongs elsewhere/NULL).

### `validation_studies` (0110) — unchanged

`result JSONB` continues to store `WalkForwardResult` / `SensitivitySurface`;
its window/point entries now carry **real** run ids plus the new `persisted`
flag (see model changes). `params` (kind + config_name + study params) is the
clone source for re-run.

### `lockbox_ledger` (0112)

| Column | Used how (new in 014) |
|---|---|
| `run_id UUID NULL` | **written** after the one-shot evaluation's child run is pushed |

## Pydantic model changes (backend `models.py`, `storage/models.py`, `api/schemas.py`)

### `WindowMetrics` (models.py) — modified

```python
persisted: bool = False   # NEW — True when run_id refers to a stored run
                          # (successful push or dedup hit). Default False ⇒
                          # pre-014 stored results parse as not-drillable.
run_id: str               # existing — now the real cloud run id when persisted
```

### `SensitivityPoint` (models.py) — modified

```python
persisted: bool = False   # NEW — same semantics as WindowMetrics.persisted
run_id: str               # existing — real cloud run id when persisted
```

### `RunRow` / `PushRunPayload` (storage/models.py) — **unchanged**

`RunRow` already models `study_id` / `segment` / `window_index` (0111 work).
014 starts populating them through `build_run_payload()`.

### `RunView` (api/schemas.py) — modified

```python
study_id: UUID | None = None       # NEW — child runs expose their parent study
segment: str | None = None         # NEW — 'train' | 'validation' | 'lockbox'
window_index: int | None = None    # NEW — window / grid-point ordinal
```

### `StudyRerunResponse` (api/schemas.py) — new

```python
study_id: UUID                     # the NEW study created by the clone
planned_evaluations: int           # same shape start_study returns today
```

## New/changed function surfaces (no new entities)

| Surface | Change |
|---|---|
| `storage/push.py::build_run_payload(result, *, user_id, config_id, strategy_id, run_id, study_id=None, segment=None, window_index=None, config_snapshot=None) -> PushRunPayload` | **new** — single mapper from `BacktestResult`; `gather_run_outputs()` refactored to file-read + this mapper (parity-locked). `spec_hash` is NOT a payload concern — it is stamped post-push via the existing `set_run_spec_hash()` (api/lifecycle.py pattern) |
| `validation_lifecycle::make_study_persist(...) -> persist(result, *, segment, window_index) -> tuple[str, bool]` | **new** — carries user/config/strategy + snapshot context; returns `(run_id, persisted)`; never raises (fail-soft) |
| `validation/study.py::run_*_study(..., persist=None)` | **modified** — evaluate() closures stamp `(run_id, persisted)` into metrics; `persist=None` ⇒ today's behavior (unit tests stay offline) |
| `client.list_runs()` | **modified** — adds `study_id IS NULL` filter |
| `client.set_lockbox_ledger_run_id(ledger_id, run_id)` | **new** — small PostgREST update |
| `validation_lifecycle.run_lockbox()` | **modified** — pushes child (`segment='lockbox'`) then links ledger |
| `validation_lifecycle.rerun_study(study_id, ...)` | **new** — loads study row → `start_study(kind, config_name, params, confirm_large=True)` |

## Result JSON drillability contract (stored in `validation_studies.result`)

- Post-014 walk-forward: `windows[i].in_sample.persisted` /
  `windows[i].out_of_sample.persisted` gate the UI links; same for
  `points[j].persisted` in sensitivity surfaces.
- Pre-014 results: the key is absent → frontend treats missing as `false`.
- A failed push in a post-014 study yields `persisted: false` for that single
  window/point only.

## State transitions

Child run rows reuse the standalone lifecycle (`queued → running → finished` is
collapsed: children are pushed already-`finished` via the atomic `push_run`
RPC; there is no queued/running child state). Study status lifecycle
(`queued → running → finished/failed`) is unchanged.
