# API Contract: Config Summary Fields

This feature adds two **derived, read-only** fields to the existing `ConfigView` payload. No new
endpoint, no request-shape change. Every endpoint that returns a `ConfigView` gains the fields.

## Affected responses

- `GET /api/configs` → `ConfigListResponse { configs: ConfigView[] }`
- `POST /api/configs`, `POST /api/configs/{id}/duplicate`, `POST /api/configs/{id}/activate`,
  `PATCH /api/configs/{id}` → `ConfigView`
- Anywhere `RunManifestView.config` is embedded → `ConfigView`

(Auth unchanged: these endpoints still require the bearer token.)

## ConfigView (additive fields)

```jsonc
{
  "id": "….",
  "name": "auto09-c3-buffer_pct0.2",
  "mode": "backtest",
  "timeframe": "5m",
  "strategy_id": "….",
  "params": { /* unchanged */ },
  "is_active": false,
  "description": null,                      // UNCHANGED — provenance, not touched

  // NEW — derived from params, deterministic, read-only:
  "summary": "VWAP pullback · ≤0.5% from VWAP · 0.2% stop buffer · 2:1 R:R · 15-min opening range · all-day entry",
  "highlights": [
    { "label": "max distance from VWAP (%)", "value": "≤0.5%" },
    { "label": "stop buffer (%)",            "value": "0.2%" },
    { "label": "risk:reward target",         "value": "2:1 R:R" },
    { "label": "opening range (minutes)",    "value": "15 min" },
    { "label": "entry window",               "value": "all-day" }
  ]
}
```

## Contract guarantees

1. **Determinism**: For a fixed `params`, `summary` and `highlights` are byte-identical across
   requests (FR-002, SC-003).
2. **Always present & non-empty `summary`**: Every `ConfigView` includes `summary` (string, length ≥ 1)
   and `highlights` (array, possibly empty). No config returns only its technical name (SC-001).
3. **Totality**: Configs with missing, empty, partial, or unknown `params` still return a valid
   payload — absent knobs are omitted; `summary` falls back to the strategy family. Never a 5xx from
   summarization (FR-007, SC-006).
4. **Non-interference**: `description` and all other existing fields are byte-identical to before this
   feature (FR-008, SC-005). Summarization performs no writes.
5. **Name preserved**: `name` is unchanged and still present; the summary augments, never replaces it
   (FR-005).

## Example derivations (deterministic test vectors)

| params (salient) | expected `summary` |
|---|---|
| dist 0.5, buffer 0.2, rr 2.0, OR 15, window 0–390 | `VWAP pullback · ≤0.5% from VWAP · 0.2% stop buffer · 2:1 R:R · 15-min opening range · all-day entry` |
| dist 1.0, buffer 0.05, rr 1.5, OR 30, window 0–390 | `VWAP pullback · ≤1% from VWAP · 0.05% stop buffer · 1.5:1 R:R · 30-min opening range · all-day entry` |
| dist 0.5, buffer 0.2, rr 2.0, OR 15, window 60–300 | `… · entry 60–300 min` (instead of `all-day entry`) |
| `{}` (empty params) | `VWAP pullback` |
| unknown extra key + buffer 0.2 only | `VWAP pullback · 0.2% stop buffer` (unknown key ignored) |

(Exact punctuation/wording is pinned by the backend unit tests; this table is the intent.)
