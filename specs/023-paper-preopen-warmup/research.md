# Phase 0 Research: Pre-Open Warmup for Live Paper Trading

All Technical Context items were resolvable from the existing codebase; no open NEEDS CLARIFICATION remain.

## R1 — Where to enforce the pre-open guard

**Decision**: Enforce in `LiveSessionEngine.on_five_minute_bar` (the single funnel for completed 5m bars), by comparing the bar's ET time to `self.clock.session_start`. If `et_time < session_start`: journal a `pre_open` lifecycle event and `return` before `session_state.append` / `_evaluate`.

**Rationale**:
- It is the one chokepoint every live 5m bar passes through; the strategy/risk path is downstream of it.
- The corruption risk lives in `SessionState.append` → `attach_indicators` (VWAP is a `cumsum` over the whole `session_date` group; the opening range anchors to `g["timestamp"].iloc[0]`, i.e. the *first bar in the frame*). Dropping the bar **before** `append` is the only place that keeps both VWAP and OR anchored to 09:30.
- `clock.session_start` is the existing single source of truth (constitution: consult `clock.py`, don't hardcode 09:30).

**Alternatives considered**:
- *Filter in the aggregator*: rejected — the aggregator is symbol/grid-only and shouldn't know session semantics; and it would still need a clock.
- *Filter in `SessionState`*: rejected — `SessionState` is a pure indicator buffer; the engine owns session/clock policy and journaling.
- *Rely on `allow_new_trades`*: rejected — that gate stops pre-open *trades* but the bar is still appended, so VWAP/OR still get corrupted. Insufficient.

## R2 — Aggregator boundary safety (does pre-open contaminate the 09:30 bar?)

**Decision**: No aggregator change needed. Verified `BarAggregator` buckets on the 5-minute clock grid (`hour, minute - minute%5`). 09:30 is a clean bucket start, so pre-open 1m bars (…09:25–09:29) flush as a *separate* pre-open 5m bar when the 09:30 bar arrives; the 09:30 bucket begins fresh with no pre-open volume/price. A dedicated test will lock this boundary behavior.

**Rationale**: The guard at the engine drops the emitted pre-open 5m bar; the 09:30 bar is already uncontaminated by construction.

## R3 — Warmup data source and shape

**Decision**: Reuse the existing `fetch_intraday_df()` in `api/routers/trade.py` (today's SPY 1-minute bars via Alpaca REST, already `start=09:30 ET`). Aggregate those 1m rows to completed 5m `Bar`s (same 5m bucketing already used for the chart / by `BarAggregator`) and pass them to `SessionState.warmup(bars)` at session start, before the live stream begins emitting.

**Rationale**:
- FR-007 (warmup is RTH-only) is satisfied for free: the fetcher already starts at 09:30, so it never returns pre-open bars.
- No new dependency or data source; `SessionState.warmup()` already exists and just iterates `_push` (no indicator corruption because the bars are all RTH).
- Reusing the established 1m→5m bucketing keeps live/backtest parity.

**Alternatives considered**:
- *Fetch 5m bars directly from Alpaca*: viable but introduces a second fetch shape and risks grid-misalignment vs. the live aggregator; rejected for parity simplicity.
- *Warmup with raw 1m bars*: rejected — the engine/strategy operate on completed 5m bars (constitution timeframe); warmup must match.

## R4 — Wiring point for warmup in the runner/start path

**Decision**: The `start_automation` background task (`run_paper_session_task`) fetches the warmup 1m frame (guarded by credentials, fail-soft) and hands warmup bars to `PaperSessionRunner`, which applies them to the engine's `SessionState` *before* `run()` starts streaming. The warmup outcome is journaled (`loaded N bars` / `empty` / `fetch_failed`).

**Rationale**: `run_paper_session_task` already owns credential/stream wiring and is the module-level seam tests stub. Keeping the fetch there (not inside the pure engine) preserves the engine's offline-testability; the runner stays thin glue. Fail-soft matches the existing "never a phantom running" contract (FR-008).

**Alternatives considered**:
- *Warmup inside the engine constructor*: rejected — pulls a network fetch into the synchronous, offline-tested engine.
- *Warmup as a synchronous step in the HTTP handler*: rejected — would block the request; the background task is the right place.

## R5 — Configuration

**Decision**: No new config knob. Early start is always permitted; the guard makes it safe unconditionally. `paper.warmup_lookback_days` exists in config but is out of scope here (today's intraday warmup only).

**Rationale**: Adding a "allow pre-open start" flag would be dead complexity — there is no scenario where corrupting indicators or trading pre-open is desired, so the safe behavior is the only behavior. Honors "no new thresholds unless needed."

## R6 — Journal event names

**Decision**: Pre-open bar → `journal.lifecycle("pre_open", …)` with the bar timestamp/trading day. Warmup → `journal.lifecycle("warmup", …, loaded=N)` (or a `reason` on failure). Both reuse the existing `LiveJournal.lifecycle` path (Principle VII), no schema change.
