# Quickstart: Live Paper Trading (021)

## Prerequisites

- Alpaca account with PAPER trading enabled; API key/secret in
  `backend/.env` (`ALPACA_API_KEY`, `ALPACA_SECRET_KEY`). The app only
  ever constructs the paper trading client — a non-paper endpoint refuses
  to start.
- Market-data subscription active (SIP feed configured via `alpaca.feed`).
- Docker stack running (`docker compose up`), migrations applied through
  `0129_paper_trading.sql`.

## Start trading (the 60-second version)

1. Open **/trade**.
2. Confirm the active config shown is the one you intend to trade — the
   session snapshots it at start.
3. Press **Start automation**.
   - Market open → status `running`; the chart ticks; signals appear in
     the journal as bars complete.
   - Market closed → status `armed`; trading begins at the next 09:30 ET.
4. Walk away. The session is server-side and multi-day: it trades each
   day, force-flats by 15:55 ET, idles overnight, resumes next open.
5. Press **Stop automation** to end it. Open positions still exit via
   their broker-side stop/target (or close manually).

## Reading the page

- **Chart**: 1m / 5m / 1d / 30d views; VWAP overlaid on intraday views
  (30d explains why it has none). Open-position entry/stop/target lines.
- **Account panel**: position, open orders, today's P&L — reconciled
  against the broker every few seconds. A drift banner pauses new entries
  until you acknowledge.
- **Forward record**: equity curve, per-trade R multiples, summary
  metrics — same definitions as backtests, but this data NEVER feeds the
  Insights archive (it is your forward out-of-sample).
- **Journal**: every emitted/approved/rejected/executed/exited/force-flat
  plus session lifecycle events (data gaps, safety pauses, broker
  rejections).

## Manual orders (US4)

Manual buys go through the SAME risk manager: provide stop + target, the
risk manager sizes from the config's `account_value` and can veto. No
stop = refused before the broker is ever called.

## Safety behaviors to expect

- **Backend restart**: the session is marked `interrupted` (never silently
  resumed); your position stays protected by broker-side brackets;
  restart it from /trade.
- **Stale data** (no bars for `paper.stale_data_seconds` during RTH):
  entries pause, journaled; auto-resumes when data returns.
- **One session at a time**: a second Start is refused.

## Config (backend/config/config.yaml)

```yaml
paper:
  stale_data_seconds: 120
  reconcile_seconds: 5
  warmup_lookback_days: 1
  chart_30d_days: 30
```

## Off-hours verification

The full pipeline is testable without a live market: the test suite drives
the engine with a faked stream/trading client (the same bar fixtures
backtests use). For an end-to-end smoke outside RTH: press Start (session
arms, journaled), verify state/journal endpoints, Stop. Live-fire
verification happens the next market session.
