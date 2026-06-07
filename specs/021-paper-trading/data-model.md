# Data Model: Live Paper Trading (021)

Four new user-scoped tables (migration `0129_paper_trading.sql`), standard
RLS (`auth.uid() = user_id` policies for select/insert/update). Entirely
separate from `runs`/study tables (spec Clarifications) — nothing here is
read by Insights aggregates, gates, or recommendations.

## paper_sessions

One row per operator-initiated automation session (multi-day).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid → auth.users | RLS scope |
| strategy_id | uuid → strategies | |
| config_id | uuid → configs (on delete set null) | provenance |
| config_name | text | survives config deletion |
| config_snapshot | jsonb | frozen params at start (FR-002) |
| status | text check in ('running','stopped','interrupted') | |
| entries_paused | boolean default false | safety pause / reconcile mismatch (FR-016/022) |
| pause_reason | text null | 'stale_data' / 'reconcile_mismatch' / null |
| started_at | timestamptz | |
| stopped_at | timestamptz null | |
| stop_reason | text null | 'operator' / 'restart' / 'error: …' |
| created_at / updated_at | timestamptz | |

Indexes: `paper_sessions_one_running_idx` UNIQUE (user_id) WHERE
status = 'running' (FR-003; same pattern as campaigns).

State transitions: `running → stopped` (operator), `running → interrupted`
(startup reconciler after a crash/restart — never silently resumed).
`entries_paused` toggles within `running` (safety events / operator ack).

## paper_orders

Every order sent to the broker (entries, protective legs, closes).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | RLS |
| session_id | uuid → paper_sessions | |
| broker_order_id | text unique | Alpaca id |
| client_order_id | text | idempotency key we generate |
| leg | text check in ('entry','take_profit','stop_loss','close') | |
| origin | text check in ('strategy','manual','force_flat') | FR-018 |
| side | text check in ('buy','sell') | |
| qty | integer > 0 | |
| limit_price / stop_price | numeric null | per leg |
| status | text | submitted/partial/filled/cancelled/rejected (broker lifecycle) |
| filled_qty | integer default 0 | |
| filled_avg_price | numeric null | |
| submitted_at / updated_at | timestamptz | |
| raw | jsonb | last broker payload (audit) |

## paper_trades

One row per completed round-trip (the forward evidence unit).

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | RLS |
| session_id | uuid → paper_sessions | |
| trading_day | date | ET session date |
| origin | text check in ('strategy','manual') | |
| qty | integer | |
| entry_time / exit_time | timestamptz | |
| entry_price / exit_price | numeric | broker fills (truth) |
| stop_loss / take_profit | numeric | the protective levels |
| exit_reason | text check in ('stop','target','force_flat','manual') | backtest vocabulary |
| gross_pnl | numeric | (exit−entry)×qty |
| fees | numeric default 0 | paper venue reports none today; column future-proofs |
| realized_r | numeric | (exit−entry)/(entry−stop) |
| entry_order_id / exit_order_id | uuid → paper_orders | |

`realized_r` uses the SAME definition as backtests so US3's summary
metrics (win rate, expectancy R, total R) are computed by the same rules.

## paper_events

Append-only live journal (FR-010/011) — the journal taxonomy plus
session-lifecycle events.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | RLS |
| session_id | uuid → paper_sessions | |
| seq | bigint | per-session monotone sequence |
| trading_day | date | |
| timestamp | timestamptz | event time (ET-derived) |
| kind | text | signal taxonomy: emitted/approved/rejected/executed/exited/force_flat/lockout/skipped_window **plus** lifecycle: session_started/session_stopped/session_interrupted/armed/day_rolled/data_gap/safety_pause/safety_resume/reconcile_mismatch/reconcile_ack/broker_reject |
| payload | jsonb | JournalEntry-shaped fields for signal events (planned_entry, stop_loss, take_profit, quantity, vwap, or_high/low, distance_from_vwap_pct, reason, rejection_check, realized_pnl, realized_r, …) + context for lifecycle events |

UNIQUE (session_id, seq). No UPDATE policy — append-only by RLS
construction (insert + select only).

## Derived (not stored)

- **Position / open orders / equity**: read live from the broker
  (reconcile loop, R5) — never persisted as truth; `paper_orders` rows are
  the audit trail.
- **Forward performance record** (US3): equity curve + summary metrics are
  computed on read from `paper_trades` (cum gross_pnl over time; win rate,
  expectancy R, total R via the existing summary formulas).

## Validation rules (model level)

- symbol is implicitly SPY everywhere; any non-SPY broker payload is
  rejected and journaled (`broker_reject`) — constitution I.
- side 'buy' only for entries (long-only) — constitution II; 'sell' rows
  only for protective/close legs.
- An entry order is never inserted without stop_loss AND take_profit
  values present (constitution III).
