# Quickstart — Monte Carlo Path-Risk Analysis (015)

## Run the engine tests (fastest signal)

```bash
cd backend
PYTHONPATH=. .venv/bin/pytest tests/validation/test_monte_carlo.py -q
```

Covers: hand-computed path-stat fixtures (4-trade cases verifiable on paper),
determinism (same seed → identical result), shuffle terminal-equity
constancy, cone band ordering, ruin monotonicity, downsampling cap, guards.

## Run the API contract tests

```bash
PYTHONPATH=. .venv/bin/pytest tests/api/new/test_monte_carlo_api.py -q
```

Covers: 200 happy path, 404 not-found/not-owned, 422 too-few-trades /
no-trade-data / unreadable-snapshot, response schema, determinism across two
calls.

## Run the frontend tests

```bash
cd frontend
npm test -- monte-carlo
```

Covers: panel renders all three sections from a fixture `MonteCarloResult`;
caveat banner iff `segment` is not `validation`/`lockbox`; tooltips present;
loading/error/low-confidence states.

## Exercise the endpoint manually

Backend code changes require an image rebuild first:

```bash
docker compose up -d --build backend
```

Then (with a valid JWT — live e2e is done from the browser session):

```bash
curl -s -X POST http://localhost:8001/api/validation/monte-carlo \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"run_id": "<RUN_ID>"}' | jq '{trade_count, seed, ruin, low_confidence}'
```

Run it twice — the outputs must be byte-identical (FR-005).

## See it in the UI

1. Open any run detail page (`/runs/<id>`) — e.g. drill into a walk-forward
   window's child run from a study detail page.
2. Find the **Monte Carlo risk** card (beside the Significance panel) and
   click **Run simulation**.
3. Verify: drawdown table (observed vs P50/P95) + histogram, forward cone fan
   chart, ruin probabilities row.
4. Caveat rule: a `train`-segment child, a no-segment sensitivity child, or a
   plain backtest shows the in-sample banner; a `validation`-segment child
   does not.
5. Every concept label has a `?` HelpTooltip.

## Config knobs

`backend/config/config.yaml` → `validation.monte_carlo`
(`iterations`, `seed`, `ruin_thresholds_pct`, `horizon_trades`,
`max_cone_steps`). Changing any knob changes results — determinism is
per-config.
