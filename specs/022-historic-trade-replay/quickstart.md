# Quickstart — Historic Trade Replay

## What it is
A simulator that replays a real past SPY session from stored 5-minute history so you can watch
it unfold, trade it by hand, and/or watch the strategy trade it — at any speed. It is a
**historical simulation**: no brokerage is touched, and nothing it produces is written to the
database or the runs/Insights archive or the live paper record.

## Operator flow
1. Start the local stack (backend :8001, frontend :5173).
2. Open **Trade → Historic Trade** (`/trade/historic`).
3. Pick a covered session date (the picker only offers dates with stored bars on real trading
   days) and press **Play**.
4. Watch the chart, VWAP, and opening range build bar by bar. Adjust **speed** (1s = real-time
   … 1hr = ~7s for the whole day) or **Pause** at any time.
5. Optionally **enable automation** to watch the VWAP-pullback strategy trade, and/or place
   **manual buys** (stop + target required) and closes. Every decision — including skipped and
   rejected setups — streams into the journal.
6. At 15:55 (sim time) any open position is force-flattened; at the close the replay ends with
   a **recap** (trades, P&L, equity curve, full journal).
7. **Stop** discards the replay. Refresh re-attaches to a running replay; a backend restart
   ends it (you start a new one — never a silent resume).

## Dev notes
- Backend tests: from `backend/`, `PYTHONPATH=src .venv-sbx/bin/python -m pytest -q -m "not
  slow and not integration" tests/test_replay_*.py`.
- Frontend tests: in the docker container, vitest on `HistoricTradePage.test.tsx`,
  `ReplayControls.test.tsx`, and the help-coverage test.
- **Parity check (SC-004)**: `test_replay_backtest_parity.py` runs a replay of a fixed date at
  max speed with automation-only and asserts the produced trades equal a backtest of the same
  date/config (same entries, exits, prices, R) — because both run the same
  `strategy`→`risk`→`broker/paper.py` primitives over the same bars.
- **No migration.** Nothing to apply. State is in-memory (`replay/runner.py` `REPLAY_RUNNING`).
- New config block `replay.speeds` / `replay.default_speed` in `backend/config/config.yaml`.

## Key files
- Backend: `backend/src/intraday_trade_spy/replay/{engine,runner,session,journal}.py`,
  `api/routers/replay.py`.
- Frontend: `frontend/src/routes/_authenticated.trade_.historic.tsx`,
  `components/trade/HistoricTradePage.tsx`, `components/trade/ReplayControls.tsx`,
  `api/replay.ts`, `hooks/useReplay.ts`.

## Guardrails it inherits (constitution)
SPY-only · long-only · risk-manager veto · stop+target mandatory (no stop = no trade) ·
journal everything · educational tooltips on every new concept · America/New_York via
`clock.py` · all numbers from `config.yaml`.
