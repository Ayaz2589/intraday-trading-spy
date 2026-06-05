# Quickstart — 016 Insights / Pooled Gate / Claude Narrative

## One-time setup

```bash
# 1. New dependency (then rebuild the container for runtime)
cd backend && uv pip install -e .   # or: .venv/bin/pip install -e .
docker compose up -d --build backend

# 2. API key (server-side only; feature degrades gracefully without it)
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> backend/.env   # + container env

# 3. Migration 0123 (cloud, via the established direct-psycopg route)
#    applies insight_analyses + insight_settings + RLS
```

## Run the tests

```bash
cd backend
PYTHONPATH=. .venv/bin/pytest tests/validation/test_pooled.py -q          # engine + worked examples
PYTHONPATH=. .venv/bin/pytest tests/api/new/test_pooled_gate_api.py \
                              tests/api/new/test_insights_api.py \
                              tests/api/new/test_claude_analyst.py -q     # contracts (SDK mocked)

cd ../frontend
npm test -- --run insights pooled claude-read
npx tsc --noEmit
```

Engine tests pin the 2026-06-05 worked examples: sign test 9/12 → 0.0730;
Fisher X²=85, df=24 → 9.53e-9; gate-rule boundary at CI low = 0.

## SC-001 — reproduce the wf-rr3 verdict (the acceptance moment)

1. Open the wf-rr3 walk-forward study (`dfed4531…`) → **Pooled gate** panel →
   **Run gate**.
2. Expect within seconds: **GATE: NOT PASSED** — pooled expectancy
   **$0.91/trade**, 95% CI **[−0.53, +2.56]**, **2,607** pooled trades,
   9/12 windows positive (sign p 0.073) — matching the 2026-06-05 ad-hoc run.
3. **Run full gate** → background progress → per-window p-values appear on
   window rows; banner gains Fisher combined p (≈1e-8).
4. Re-run fast gate → byte-identical numbers (SC-003).

## Insights page

1. Nav rail → **Insights**: edge time-series (one point per OOS window, per
   config; click a point → child run), config distribution side by side;
   Claude panel on the right.
2. Empty-archive behavior: instructive empty states, Claude button disabled.

## Claude's read

1. On Insights or a study with a computed gate → **Get Claude's read** →
   structured narrative: summary, findings (each claim beside the cited
   metric's app-computed value), risks, suggested experiments; footer
   `snapshot <hash> · <model> · <date>`.
2. Revisit the page → stored analysis loads with **no** provider call;
   Regenerate disabled until data changes (or force).
3. Failure drills: remove the API key → setup hint, everything else works;
   simulate billing exhaustion (mock test covers it; live: drain credit) →
   paused banner + one-click Re-enable; manual pause toggle works.

## Config knobs

`backend/config/config.yaml` → `validation.pooled_gate` (alpha, seed) and
`insights.claude` (model — default `claude-opus-4-8`, max_tokens,
max_timeseries_windows).
