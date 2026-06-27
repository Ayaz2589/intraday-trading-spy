# Quickstart: Human-Readable Config Descriptions

## What this feature does

Every strategy config now reports a plain-English `summary` of what it does, derived automatically
from its parameters. The cryptic technical name stays; the summary sits next to it.

## Backend — try the derivation

```bash
# Unit-test the pure function (TDD: written first, must pass)
docker compose exec -T backend python -m pytest tests/test_config_summary.py -q

# See it on the real API shape (inside the running container)
docker compose exec -T backend python - <<'PY'
from intraday_trade_spy.config_summary import summarize_config
s = summarize_config({
    "strategy": {
        "opening_range": {"minutes": 15},
        "vwap_pullback": {
            "max_distance_from_vwap_pct": 0.5,
            "stop": {"buffer_pct": 0.2},
            "target": {"risk_reward": 2.0},
            "entry_window": {"start_minutes_after_open": 0, "end_minutes_after_open": 390},
        },
    }
})
print(s.summary)
for h in s.highlights:
    print(" ", h.label, "=", h.value)
PY
```

Expected `summary`:
`VWAP pullback · ≤0.5% from VWAP · 0.2% stop buffer · 2:1 R:R · 15-min opening range · all-day entry`

## Backend — verify the API contract

```bash
docker compose exec -T backend python -m pytest tests/api/test_configs_summary.py -q
```

Confirms `GET /api/configs` returns `summary` (non-empty) and `highlights` on each config, and that
`description` is unchanged.

## Frontend — verify rendering

```bash
docker compose exec -T frontend npx vitest run src/components/strategies/config-summary.test.tsx \
  src/components/strategies/config-list.test.tsx \
  src/components/strategy-config-dropdown.test.tsx
```

## See it in the app

1. Open the app (Strategies page).
2. Each config row shows its technical name AND a human-readable summary line, with a `?` help
   tooltip explaining the summary is auto-derived from the config's parameters.
3. Open the topbar config selector — each option shows its summary too.

## Acceptance smoke checklist

- [ ] Every config in the list shows a non-empty summary (SC-001).
- [ ] Two configs differing only in stop buffer read differently (SC-002).
- [ ] A config with `{}` params still shows "VWAP pullback" (SC-006).
- [ ] `description` (provenance) is unchanged and not shown in place of the summary (SC-005, FR-008).
