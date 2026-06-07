# Tasks: Live Paper Trading + /trade Page

**Input**: Design documents from `/specs/021-paper-trading/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R10), data-model.md,
contracts/trade-api.md, quickstart.md

**Tests**: Constitution IV (Test-First Everywhere) — every implementation
task touching `backend/src/**` or `frontend/src/**` is preceded by its
failing-test task below. Config YAML / SQL migration / docs are exempt.

**Organization**: Phases follow spec priorities: Setup → Foundational →
US1 (automation) → US2 (/trade cockpit) → US3 (forward record) →
US4 (manual orders) → Polish.

## Phase 1: Setup

- [X] T001 Add `paper:` config block (stale_data_seconds: 120, reconcile_seconds: 5, warmup_lookback_days: 1, chart_30d_days: 30) to backend/config/config.yaml (exempt: YAML)
- [X] T002 Failing tests for `PaperConfig` model (defaults, bounds, load_config wiring) in backend/tests/test_config.py
- [X] T003 Implement `PaperConfig` Pydantic model + wire into the master config in backend/src/intraday_trade_spy/config.py
- [X] T004 Write migration backend/db/migrations/0129_paper_trading.sql — paper_sessions / paper_orders / paper_trades / paper_events per data-model.md, RLS policies (select/insert/update; paper_events insert+select only = append-only), `paper_sessions_one_running_idx` UNIQUE (user_id) WHERE status='running' (exempt: SQL; apply to Supabase)

## Phase 2: Foundational (blocking all stories)

- [X] T005 [P] Failing tests for storage CRUD: insert/get/update paper_sessions (incl. one-running conflict), insert paper_orders/paper_trades, append paper_events with per-session seq monotonicity, in backend/tests/storage/test_paper_storage.py
- [X] T006 Implement paper_* storage methods on the storage client in backend/src/intraday_trade_spy/storage/client.py
- [X] T007 [P] Failing tests for the 1m→5m aggregator (bucket boundaries on ET 5-minute marks, partial-bucket not emitted, session roll, out-of-order bar rejected) in backend/tests/live/test_aggregator.py
- [X] T008 Implement `aggregator.py` (1-minute bars → completed 5-minute bars) in backend/src/intraday_trade_spy/live/aggregator.py
- [X] T009 [P] Failing tests for the Alpaca broker wrapper: paper-endpoint guard (non-paper URL raises — constitution V unreachability test), bracket order submit carries stop+target, close_position, cancel_open_orders, reads (position/orders/equity), broker rejection surfaces; ALL against a faked TradingClient, in backend/tests/live/test_alpaca_broker.py
- [X] T010 Implement `alpaca_broker.py` — TradingClient(paper=True) at the single construction site, bracket submit, close/cancel, reconcile reads, injectable client for tests, in backend/src/intraday_trade_spy/live/alpaca_broker.py
- [X] T011 [P] Failing tests for the live journal writer (append-only seq, signal-taxonomy payload shape matches JournalEntry fields, lifecycle kinds) in backend/tests/live/test_live_journal.py
- [X] T012 Implement `journal.py` paper_events writer in backend/src/intraday_trade_spy/live/journal.py
- [X] T013 [P] Failing tests for session_state: warmup df + appended bars → attach_indicators recompute → snapshot equals backtest snapshot on identical fixture bars (golden parity test), in backend/tests/live/test_session_state.py
- [X] T014 Implement `session_state.py` (session bar frame, warmup load via existing historical client, snapshot reuse) in backend/src/intraday_trade_spy/live/session_state.py

**Checkpoint**: foundation proven offline — brokers/streams faked, parity
with backtest indicators demonstrated.

## Phase 3: User Story 1 — Start/stop automated paper trading (P1) 🎯 MVP

- [X] T015 [P] [US1] Failing tests for `LiveSessionEngine` decision flow: completed 5m bar → evaluate → risk.validate → bracket submit on approve; rejection journaled with reason code; WindowSkip journaled; no-entry after 15:30; force-flat at 15:55 cancels+closes+journals; daily RiskState roll; stop() blocks new entries but keeps managing exits; stale-data pause + resume events; ALL with faked stream/broker/clock fixtures, in backend/tests/live/test_engine.py
- [X] T016 [US1] Implement `engine.py` LiveSessionEngine (multi-day loop: warmup → trade window → force-flat → idle to next open; safety pauses; fill events → paper_trades rows with realized_r) in backend/src/intraday_trade_spy/live/engine.py
- [X] T017 [P] [US1] Failing tests for stream wrappers: reconnect/backoff invoked on disconnect, data-gap event emitted, TradingStream fill events forwarded, against faked websocket clients, in backend/tests/live/test_alpaca_stream.py
- [X] T018 [US1] Implement `alpaca_stream.py` (StockDataStream + TradingStream wrappers, injectable, reconnect with backoff) in backend/src/intraday_trade_spy/live/alpaca_stream.py
- [X] T019 [P] [US1] Failing API tests: POST /api/trade/automation/start (201 creates running session w/ config snapshot; 409 when one runs; 422 when creds absent; market-closed arms and journals), POST /api/trade/automation/stop (200, journaled), in backend/tests/api/new/test_trade_api.py
- [X] T020 [US1] Implement automation start/stop in new router backend/src/intraday_trade_spy/api/routers/trade.py (BackgroundTask launches the engine — campaign pattern) and mount it in backend/src/intraday_trade_spy/api/app.py
- [X] T021 [P] [US1] Failing test: lifespan reconciler marks `running` paper_sessions `interrupted` + journals session_interrupted on startup (FR-009), in backend/tests/api/new/test_trade_lifecycle.py
- [X] T022 [US1] Implement the interrupted-session reconciler in backend/src/intraday_trade_spy/api/app.py (_lifespan)

**Checkpoint**: US1 independently testable — start/stop via API, full
engine behavior proven against fixtures; arming works off-hours.

## Phase 4: User Story 2 — /trade cockpit (P2)

- [X] T023 [P] [US2] Failing API tests: GET /api/trade/state (session/market/position/open_orders/today/account per contract; drift pauses entries + ack endpoint clears), GET /api/trade/bars (four views, `since` increments, vwap on intraday only, position_levels), in backend/tests/api/new/test_trade_api.py
- [X] T024 [US2] Implement state/bars/ack-pause endpoints + reconcile loop wiring in backend/src/intraday_trade_spy/api/routers/trade.py
- [X] T025 [P] [US2] Failing tests for `api/trade.ts` client + `useTrade` polling hooks (1s while running/open, 5s idle; since-cursor accumulation) in frontend/src/hooks/useTrade.test.ts
- [X] T026 [US2] Implement frontend/src/api/trade.ts + frontend/src/hooks/useTrade.ts
- [X] T027 [P] [US2] Failing tests for TradeControls (start/stop/ack buttons, armed vs running vs interrupted states, market-closed explainer) in frontend/src/components/trade/TradeControls.test.tsx
- [X] T028 [US2] Implement frontend/src/components/trade/TradeControls.tsx
- [X] T029 [P] [US2] Failing tests for LiveChart (view switcher 1m/5m/1d/30d, vwap toggle present on intraday + absent-with-reason on 30d, position level lines rendered, appends without full reload) in frontend/src/components/trade/LiveChart.test.tsx
- [X] T030 [US2] Implement frontend/src/components/trade/LiveChart.tsx (klinecharts reuse incl. registered VWAP indicator)
- [X] T031 [P] [US2] Failing tests for AccountPanel (position/orders/today P&L, broker-equity vs sizing-account display, drift banner pauses messaging) in frontend/src/components/trade/AccountPanel.test.tsx
- [X] T032 [US2] Implement frontend/src/components/trade/AccountPanel.tsx
- [X] T033 [US2] Create route frontend/src/routes/_authenticated.trade.tsx composing the page + add Trade item to NAV_ITEMS in frontend/src/components/side-nav.tsx (failing route test first in frontend/src/routes/_authenticated.trade.test.tsx)

**Checkpoint**: cockpit usable — watch the market live, start/stop, see
account truth.

## Phase 5: User Story 3 — Forward performance record (P3)

- [X] T034 [P] [US3] Failing API tests: GET /api/trade/performance (summary formulas match backtest definitions on a fixture trade set — golden values), GET /api/trade/journal (seq-incremental), in backend/tests/api/new/test_trade_api.py
- [X] T035 [US3] Implement performance/journal endpoints in backend/src/intraday_trade_spy/api/routers/trade.py
- [X] T036 [P] [US3] Failing tests for ForwardPerformance (equity curve renders, summary chips, trades table w/ R + exit reasons) in frontend/src/components/trade/ForwardPerformance.test.tsx
- [X] T037 [US3] Implement frontend/src/components/trade/ForwardPerformance.tsx (reuse LineScatter)
- [X] T038 [P] [US3] Failing tests for LiveJournalTable (taxonomy + lifecycle kinds render, rejection reasons first-class, incremental append) in frontend/src/components/trade/LiveJournalTable.test.tsx
- [X] T039 [US3] Implement frontend/src/components/trade/LiveJournalTable.tsx

## Phase 6: User Story 4 — Manual orders, risk-gated (P4)

- [X] T040 [P] [US4] Failing API tests: POST /api/trade/orders (risk-sized manual buy; 422 without stop or target before any broker call; 409 + journaled rejection when risk vetoes e.g. open position), POST /api/trade/position/close (manual close journaled; 409 when flat), in backend/tests/api/new/test_trade_api.py
- [X] T041 [US4] Implement manual order + close endpoints in backend/src/intraday_trade_spy/api/routers/trade.py
- [X] T042 [P] [US4] Failing tests for ManualOrderForm (stop+target required client-side, rejection reason surfaced, close-position confirm) in frontend/src/components/trade/ManualOrderForm.test.tsx
- [X] T043 [US4] Implement frontend/src/components/trade/ManualOrderForm.tsx

## Phase 7: Polish & cross-cutting

- [X] T044 [P] Failing tooltip-coverage test: every new /trade concept (automation session, bracket/protective orders, unrealized P&L, reconciliation/drift, safety pause, paper account, force-flat, forward record) has a HelpTooltip, in frontend/src/components/trade/help-coverage.test.tsx; add entries to frontend/src/components/help-content.ts
- [X] T045 Constitution gate test sweep: bracket-exit mutual exclusivity (one leg fill cancels the other — required gate), non-SPY broker payload rejected + journaled, live-URL unreachable with default config — consolidate/verify in backend/tests/live/test_constitution_gates.py
- [X] T046 Run full suites (backend `pytest -m "not slow and not integration"`, frontend vitest + typecheck + targeted ruff on changed files); fix fallout
- [X] T047 Live verification per quickstart off-hours path: apply migration 0129, start stack, Start (arms, journaled) → state/bars/journal endpoints respond per contract → Stop; document results in specs/021-paper-trading/verification.md (full live-fire deferred to the next market session)

## Dependencies

- Phase 1 → 2 → 3; Phase 4 needs Phase 3 (state reflects sessions);
  Phases 5/6 need Phase 4's router scaffolding but are independent of
  each other; Phase 7 last.
- Within phases, [P] failing-test tasks for different files can be
  authored in parallel; each implementation task strictly follows its
  test task (constitution IV).

## Parallel execution examples

- T005/T007/T009/T011/T013 (foundational test files) in parallel, then
  their implementations in any order.
- Frontend pairs T027/T029/T031 in parallel once T025/T026 land.

## Implementation strategy

MVP = Phases 1–3 (US1): automation start/stop with the full engine proven
offline — already delivers forward evidence via API + journal even before
the page exists. Each later phase is an independently shippable increment.
