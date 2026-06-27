# Phase 1 Data Model: Human-Readable Config Descriptions

No persisted entities. All structures below are **derived at read time** and serialized on the config
response. No database table or column is added or modified.

## Derived structures (backend)

### ConfigHighlight

One salient parameter rendered for human consumption.

| Field | Type | Notes |
|-------|------|-------|
| `label` | `str` | Human label, sourced from `KNOB_REGISTRY[path].label` (e.g. "stop buffer (%)"). |
| `value` | `str` | Compact human value (e.g. "0.2%", "2:1 R:R", "all-day"). Always a string. |

### ConfigSummary

The full derived view of one config's behaviour.

| Field | Type | Notes |
|-------|------|-------|
| `summary` | `str` | One-line `·`-joined sentence. Always non-empty (≥ strategy family). |
| `highlights` | `list[ConfigHighlight]` | Ordered, salient param highlights. May be empty if params lack all known knobs (then `summary` is just the family). |

**Invariants**
- Deterministic: identical `params` → identical `summary` and `highlights` (FR-002, SC-003).
- Total: never raises; missing/empty/unknown params are skipped (FR-007, SC-006).
- `summary` is never empty (SC-001) — minimum is the strategy family label.
- Reads only `params`; never `name` or `description` (FR-008).

## API schema additions (Pydantic v2)

### ConfigHighlightView (new)

```
ConfigHighlightView:
  label: str
  value: str
```

### ConfigView (existing — additive)

Two computed fields appended; all existing fields unchanged:

```
ConfigView:
  id, name, mode, timeframe, strategy_id, params, is_active, description   # unchanged
  summary: str                       # @computed_field — summarize_config(params).summary
  highlights: list[ConfigHighlightView]   # @computed_field — summarize_config(params).highlights
```

Because these are Pydantic computed fields, they serialize automatically wherever `ConfigView` is
returned (e.g. `GET /api/configs`, `RunManifestView.config`).

## Frontend types (TypeScript)

### Config (existing — additive)

```
type ConfigHighlight = { label: string; value: string }

type Config = {
  ...existing fields (id, name, strategy_id, params, is_active, description?)...
  summary?: string
  highlights?: ConfigHighlight[]
}
```

`summary`/`highlights` are optional on the type for resilience to older payloads, but the backend
always populates them.

## Knob vocabulary dependency (read-only)

`KNOB_REGISTRY` (`backend/src/intraday_trade_spy/validation/knobs.py`) — consumed for:
- `label` text per highlight (`KnobSpec.label`).
- entry-window `min`/`max` bounds to decide "all-day" vs explicit range.

The summary module references these registry paths:
- `strategy.vwap_pullback.max_distance_from_vwap_pct`
- `strategy.vwap_pullback.stop.buffer_pct`
- `strategy.vwap_pullback.target.risk_reward`
- `strategy.opening_range.minutes`
- `strategy.vwap_pullback.entry_window.start_minutes_after_open`
- `strategy.vwap_pullback.entry_window.end_minutes_after_open`
