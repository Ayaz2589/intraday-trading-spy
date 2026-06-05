# Research — 017 Clickable Claude Experiments → Draft Configs

Grounded against the codebase 2026-06-05. Two design-doc corrections (R1, R3).

## R1 — There is NO knob registry today; 017 creates it (design-doc correction)

- **Finding**: sensitivity sweeps accept free-form dotted knob paths
  (`sweep.py:26-34` validates only axis count/non-emptiness); the only
  canonical knob list is a **frontend constant** `lib/config-knobs.ts`
  (8 knobs). Pydantic config models enforce **no numeric bounds** (ge/le),
  and the configs router stores `params` as-is — out-of-bounds values are
  caught only when a config is actually used.
- **Decision**: NEW backend module `validation/knobs.py` is the single
  registry: `KNOB_REGISTRY: dict[path, KnobSpec(min, max, kind)]` seeded with
  the 8 UI-exposed knobs, plus `sanitize_changes(changes) -> list[ConfigChange]`
  (drops off-list paths and out-of-bounds values; coerces int-kind knobs).
  Neutral home so sensitivity sweeps can adopt it later (out of scope here).
- **Alternatives**: deriving bounds from Pydantic Field constraints (none
  exist); reusing the frontend constant (frontend is not a trust boundary).

## R2 — Provenance home: migration 0124 `configs.description TEXT NULL` (design-doc correction)

- **Finding**: the configs table (`0002_configs.sql`) has NO description or
  notes column; FR-007 requires visible, durable provenance.
- **Decision**: migration **0124** adds nullable `description`;
  `create_config()` and the configs router gain an optional description
  pass-through; config views return it; the ConfigManager list renders it
  muted under the name. Drafted configs get
  `"Drafted from Claude analysis <id8> · experiment <n>: <hypothesis…>"`.
- **Alternatives**: stuffing provenance into `params._meta` (pollutes the
  deep-merge surface that `build_effective_config` consumes — rejected);
  a separate provenance table (overkill for one string).

## R3 — Idempotency invalidation: `analysis_schema_version` in the payload (design-doc correction)

- **Finding**: the stored-analysis idempotency hash is over the INPUT payload,
  which this feature does not change — so the stored pre-017 analysis would be
  returned forever, and the card's Regenerate button is disabled while
  fingerprints match. Pre-017 analyses would never gain suggestions.
- **Decision**: both payload builders add `"analysis_schema_version": 2`.
  Hash changes once → the first "Get Claude's read"/auto-render after release
  treats the data as changed (Regenerate enabled), one fresh paid call,
  then idempotent as before. Old stored analyses stay readable (FR-008).
- **Alternatives**: a force-button special case for schema upgrades (more UI
  state for a one-time event); hashing the output schema (conflates input
  identity with output shape).

## R4 — Sanitize slot: post-parse, pre-store in `claude_analyst.py`

- **Finding**: parse at `client.messages.parse(...)`; `analysis =
  parsed.model_dump()` precedes `storage.insert_insight_analysis(...)` —
  exactly one seam.
- **Decision**: `analysis["suggested..."]` sanitation runs on the dumped dict:
  for each experiment, `suggested_config_changes =
  sanitize_changes(raw_changes)`; empty lists stay as `[]` (renders
  text-only). Stored analyses are therefore trustworthy to every consumer
  (FR-002) — the UI never re-validates.

## R5 — Prompt: registry section generated FROM the registry

- **Decision**: the system prompt's new "Tunable knobs" section is rendered
  from `KNOB_REGISTRY` at call time (path, meaning, bounds) so prompt and
  enforcement cannot drift; instruction: "express experiments as
  suggested_config_changes when possible; only these knobs; otherwise leave
  the list empty." Enforcement never relies on compliance (FR-010).
- **Note**: the system prompt stays stable per process (registry is static) —
  prompt caching unaffected.

## R6 — Draft transport: TanStack search param on `/strategies` (precedent: sign-in)

- **Finding**: `sign-in/index.tsx:10-20` uses `validateSearch` +
  `Route.useSearch()` — the established pattern.
- **Decision**: `/strategies?draft=<base64url(JSON)>` validated by
  `validateSearch`; NEW pure lib `lib/draft-config.ts` encodes/decodes
  `{base_config_name, changes, analysis_id, experiment_index, hypothesis}`
  with defensive parsing (malformed → null → friendly notice, FR-008/edge).
  Dismissing navigates the param away — nothing persisted by construction.

## R7 — Prefill surface: a dedicated badged panel reusing the existing create endpoint

- **Finding**: the ConfigManager create form is name + source pickers only —
  knob values are edited post-create (012 edit-isolation). Wedging a draft
  into that form would contort it.
- **Decision**: NEW `DraftConfigPanel` renders above ConfigManager when a
  draft is present: resolves the base config by name from the loaded configs
  list (fallback: active config + explicit notice), shows base → suggested
  value rows (highlighted), an editable unique name (`<base>-exp-<n>`,
  suffix on collision), the provenance line, the badge, and Create/Dismiss.
  Create calls the **standard** `POST /api/configs` with merged params +
  description — same validation as manual (FR-005/006). This *is* the
  existing create flow, pre-filled — surfaced as its own panel.

## R8 — Experiment card rendering

- **Decision**: inside the (collapsed-by-default) experiments section, cards
  with non-empty sanitized changes list each as `knob-label → value` chips
  (labels from `lib/config-knobs.ts`) + the "Draft config →" button; cards
  with empty/missing changes render exactly as today. Old analyses lack the
  key entirely → `undefined` → text-only (FR-008, SC-005).

## R9 — Bounds for the seeded registry (defined here, enforced in code + tests)

| knob path | bounds | kind |
|---|---|---|
| `risk.account_value` | [100, 10_000_000] | float |
| `risk.max_risk_per_trade_pct` | [0.01, 10] | float |
| `risk.max_position_value_pct` | [1, 1000] | float |
| `risk.max_consecutive_losses` | [1, 10] | int |
| `strategy.opening_range.minutes` | [5, 60] | int |
| `strategy.vwap_pullback.target.risk_reward` | [0.5, 10] | float |
| `strategy.vwap_pullback.stop.buffer_pct` | [0.0, 1.0] | float |
| `strategy.vwap_pullback.max_distance_from_vwap_pct` | [0.01, 2.0] | float |

Generous-but-sane ranges: wide enough for real experiments, tight enough that
a hallucinated `risk_reward: 9000` dies at the gate.

## R10 — Migration + e2e mechanics

- 0124 applied to cloud via the established direct-psycopg route; no RLS
  change (configs RLS exists). Backend container rebuild required (baked
  code). Live SC-006: force one regeneration (schema_version bump makes the
  ordinary button do it), confirm ≥1 experiment carries valid suggestions,
  click through, create, launch a study.
