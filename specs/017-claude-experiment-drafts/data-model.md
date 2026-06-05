# Data Model — 017 Clickable Claude Experiments → Draft Configs

## A. Knob registry (`validation/knobs.py` — NEW, the single source of truth)

```python
@dataclass(frozen=True)
class KnobSpec:
    path: str          # dotted config path (matches params jsonb nesting)
    label: str         # human label for prompt + UI parity
    min: float
    max: float
    kind: Literal["float", "int"]

KNOB_REGISTRY: dict[str, KnobSpec]  # seeded with the 8 entries (research R9)

def sanitize_changes(raw: list[dict] | None) -> list[ConfigChange]:
    """Drop off-registry paths and out-of-bounds values; coerce int-kind.
    Pure; total; never raises on malformed input (defensive)."""

def registry_prompt_section() -> str:
    """Rendered list of paths + labels + bounds for the system prompt (R5)."""
```

## B. Pydantic models (`models.py`)

```python
class ConfigChange(BaseModel):
    model_config = ConfigDict(frozen=True)
    knob_path: str
    value: float

class ClaudeExperiment(BaseModel):              # extended (016 → 017)
    model_config = ConfigDict(frozen=True)
    hypothesis: str
    how_to_test: str
    suggested_config_changes: list[ConfigChange] = []   # additive; default []
```

- `ClaudeExperiment` is part of the `messages.parse()` output format — the
  model may fill `suggested_config_changes`; sanitation happens AFTER parse,
  BEFORE store (research R4). Stored jsonb holds only surviving changes.
- Old stored analyses lack the key → frontend treats `undefined` as empty.

## C. Migration 0124 (`db/migrations/0124_configs_description.sql`)

```sql
-- 0124_configs_description.sql
-- Feature 017: durable provenance for configs (e.g. drafted from a Claude
-- experiment). Nullable; existing rows unaffected. RLS unchanged (0002).
ALTER TABLE public.configs ADD COLUMN IF NOT EXISTS description TEXT;
```

Provenance format (written by the frontend draft panel into create):
`Drafted from Claude analysis <id8> · experiment <n>: <hypothesis ≤120 chars>`

## D. API schema deltas (`api/schemas.py`)

- `CreateConfigRequest`: + `description: Optional[str] = None` (≤500 chars)
- Config views (list/detail responses): + `description: Optional[str]`

## E. Draft search-param payload (frontend, transient only — `lib/draft-config.ts`)

```ts
type DraftConfig = {
  base_config_name: string            // resolved to id client-side; fallback active
  changes: ConfigChange[]             // already-sanitized (from stored analysis)
  analysis_id: string
  experiment_index: number
  hypothesis: string
}
// encodeDraft(d): base64url(JSON.stringify(d))  → ?draft=...
// decodeDraft(s): DraftConfig | null            (malformed → null)
```

Never persisted server-side; dismiss = navigate the param away (FR-006).

## F. TS mirrors (`api/types.ts`)

```ts
export type ConfigChange = { knob_path: string; value: number }
// ClaudeExperiment gains: suggested_config_changes?: ConfigChange[]
// ConfigRow gains: description: string | null
```

## G. Payload identity

Both payload builders add `"analysis_schema_version": 2` (research R3) —
one-time hash change so pre-017 analyses regenerate on the next click;
thereafter idempotency behaves exactly as in 016.
