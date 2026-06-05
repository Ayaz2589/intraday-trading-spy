# API Contracts — 017 Clickable Claude Experiments → Draft Configs

No new endpoints. Three changed surfaces + one frontend route contract.

## 1. POST /api/insights/claude-analysis — response delta

`analysis.suggested_experiments[*]` gains an optional field:

```json
{
  "hypothesis": "A wider VWAP distance captures the missed H2 entries",
  "how_to_test": "Run a walk-forward on the modified config",
  "suggested_config_changes": [
    {"knob_path": "strategy.vwap_pullback.max_distance_from_vwap_pct", "value": 0.4}
  ]
}
```

Guarantees:
- Every stored/returned change references a registry knob with an in-bounds
  value (sanitized BEFORE storage — FR-002/SC-002).
- Experiments may carry `[]` or omit the key (pre-017 rows) — both mean
  text-only.
- Payload identity: builders include `analysis_schema_version: 2` → pre-017
  stored analyses no longer hash-match (one fresh generation, then idempotent).

## 2. POST /api/configs — request/response delta

Request gains optional `description` (≤500 chars; trimmed; null if empty):

```json
{ "name": "wf-rr3-exp-1", "source": "scratch", "params": { ... },
  "description": "Drafted from Claude analysis d7e75317 · experiment 2: ..." }
```

Responses (create/list/detail) gain `description: string | null`.
Unchanged: validation, RLS, mode immutability, activation rules. The
analysis pipeline NEVER calls this endpoint (SC-003).

## 3. GET /api/configs — response delta

Each row: + `description: string | null` (rendered muted under the name).

## 4. Frontend route contract — /strategies?draft=

- `draft` (optional): base64url JSON `DraftConfig` (data-model §E),
  validated by `validateSearch`; malformed → treated as absent + friendly
  notice (FR-008).
- With a valid draft: `DraftConfigPanel` renders above the config manager —
  badge "drafted from Claude's experiment — review before creating",
  base→suggested rows highlighted, editable unique name, provenance line,
  Create (standard POST /api/configs) / Dismiss (clears the param; persists
  nothing).
- Base config name not found in the user's configs → fall back to the active
  config with an explicit substitution notice (FR-004).

## Error taxonomy (unchanged surfaces)

- Configs create: existing 400s (name length, duplicate name, forbidden
  fields) apply to drafted creates identically.
- Claude analysis: 016 taxonomy unchanged (409 paused, 503 unconfigured,
  502 transient/parse).
