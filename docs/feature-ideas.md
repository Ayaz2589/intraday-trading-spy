# Feature Ideas — Educational Trend-Finding

Backlog of candidate features that advance the app's core mission:
**teaching users how to identify and trade intraday trends in SPY.**

These are ideas, not committed work. Each must still flow through the
Spec Kit workflow (`speckit-specify → plan → tasks → analyze → implement`)
and pass a Constitution Check before implementation.

All ideas below are scoped to honor the hard constraints: SPY-only,
long-only, rule-based (no ML/HMM), paper-first, educational UI with
`HelpTooltip`, and journal-everything.

---

## 1. Rule-based "market context" / trend-state label

**What it is:** A per-session and rolling classifier that tags the
market as **Uptrend / Downtrend / Range** using simple, explainable
rules — price above/below VWAP, higher-high/higher-low (or
lower-high/lower-low) structure, and EMA slope. No ML, no HMM.

**Why it teaches trends:** Trend identification is the exact skill the
app exists to teach. Surfacing *why* a state was assigned ("price holding
above VWAP + making higher lows") gives the user a repeatable heuristic
to internalize. Pairs naturally with the mandated `HelpTooltip`
(What is this? Why does it matter? How is the app using it?).

**Reuses existing code:** VWAP already exists in
`backend/src/intraday_trade_spy/data/indicators.py`. Adds an EMA
indicator and a higher-high/higher-low structure detector.

**Effort:** Low–Medium. New indicator module + a label field on bars.

---

## 2. Interactive "you call it" replay mode

**What it is:** In the React UI, replay a historical SPY session
bar-by-bar. Pause at a bar, hide the future, and prompt the user:
*"Trend or chop? Would you take this VWAP pullback?"* Then step forward
to reveal what actually happened and whether the strategy fired.

**Why it teaches trends:** Active recall plus immediate feedback is how
traders actually learn to read price action. It turns existing backtest
data into a training simulator rather than a passive report.

**Reuses existing code:** The backtest engine
(`backend/src/intraday_trade_spy/backtest/engine.py`) already produces a
bar-by-bar signal/decision stream and journal; the replay walks that
timeline.

**Effort:** Medium (primarily frontend). High educational payoff.

---

## 3. Confluence-zone overlay

**What it is:** Compute a set of candidate price levels for the day
(prior-day high/low/close, running session high/low, round numbers,
pivot points, optionally volume-profile POC) and cluster levels that
fall within a small tolerance into "confluence zones." Render the zones
on the chart with tooltips explaining each contributing level.

**Why it teaches trends:** Trends pause and reverse at levels. Showing
"price is stalling where prior-day high + a round number + VWAP all
cluster" teaches *why* a trend stalls, not just that it did.

**Reuses existing code:** OHLCV data and multi-session CSVs already
exist; VWAP and opening-range levels are already computed. The
clustering function is a small tolerance-based grouping.

**Effort:** Low for the levels + clustering function; Medium to render
the chart overlay.

---

## Suggested sequencing

Ideas **1** and **2** reinforce each other: the trend-state label gives
users the vocabulary, and the replay mode makes them practice applying
it. Together they form the sharpest expression of "an app that teaches
you to find intraday trends." Idea **3** layers on top once the chart
and indicator surface exist.
