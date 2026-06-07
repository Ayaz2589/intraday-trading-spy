# Backtest Experiments Log

A running record of backtest experiments — each entry is a deliberate
hypothesis test against historical data, with a config delta and a
documented outcome. The point is to build intuition over time about
how the strategy behaves and which knobs matter.

## Why this file exists

Backtests are deterministic: same data + same config + same code →
same output (see [CLAUDE.md](./CLAUDE.md) and `run.yaml`'s
`data_fingerprint`). So the only way to learn anything new from a
backtest is to *change one thing* and compare. This file is the log
of those comparisons.

## Format

Each experiment captures:

1. **Hypothesis** — what you predicted *before* running. Write this
   honestly. Wrong predictions are gold — they reveal where your
   intuition diverges from reality.
2. **Knobs changed** — the config delta vs the baseline run.
3. **Run IDs** — the baseline + experiment run directories under
   `backend/data/backtests/`. So the raw data is auditable.
4. **Outcome** — key summary metrics before / after.
5. **Lesson** — the one-paragraph insight you'd want to remember in
   six months. If the outcome confirmed the hypothesis, why?
   If not, what did you miss?

Use the `/experiment` skill (`.claude/skills/experiment/SKILL.md`) to
append a new entry. It reads the baseline + experiment `run.yaml` and
`summary.json` directly so the diff and metrics are correct by
construction.

Entry IDs are zero-padded three-digit (`001`, `002`, …) and never
reused.

---

## Experiment 001 — 2026-05-29 — Looser consecutive-loss lockout

### Hypothesis

Raising `max_consecutive_losses` from 2 → 4 will let more signals
fire after a two-loss streak, increasing the total trade count.

### Knobs changed

| Field | Baseline | Experiment |
|---|---|---|
| `risk.max_consecutive_losses` | 2 | **4** |

(All other knobs identical: account $25,000, risk 0.1%, cap 100%,
OR 15 min, R:R 2.0, stop buffer 0.05%, max distance from VWAP 0.25%.)

### Run IDs

- **Baseline** (`max_consecutive_losses: 2`): `20260529-052036-7697908e`
- **Experiment** (`max_consecutive_losses: 4`): `20260529-051909-7697908e`

Both ran against the bundled synthetic fixture
(`data/raw/spy_5m_sample.csv`, fingerprint `7697908e`).

### Outcome

| Metric | Baseline | Experiment | Δ |
|---|---|---|---|
| Total trades | 3 | 3 | 0 |
| W / L | 1 / 2 | 1 / 2 | 0 |
| Win rate | 33.3% | 33.3% | 0 |
| Total R | +0.000 | +0.000 | 0 |
| Max drawdown | -2.000R | -2.000R | 0 |
| Profit factor | 1.000 | 1.000 | 0 |
| **Total rejections** | **117** | **117** | **0** |
| – Position Value Exceeds Cap | 84 | **99** | +15 |
| – Consecutive Losses Reached | 21 | **0** | -21 |
| – No New Trades After | 12 | **18** | +6 |

### Lesson

**Hypothesis falsified.** The consecutive-loss lockout was a
*non-binding* constraint — it was firing *after* the day's 3 trades
had already happened, blocking signals that wouldn't have made it
past the position cap anyway. Loosening it just shuffled the 21
lockout-rejected signals into other rejection buckets
(+15 position-cap, +6 no-new-trades-after) — exactly preserving the
total (117 = 117).

The deeper insight: **to change behavior, move the binding
constraint, not a slack one.** The cap is the binding rule here.
Loosening a non-binding rule is purely cosmetic — it changes the
rejection labels but not the trade outcomes.

---

## Experiment 002 — 2026-05-29 — Bigger risk + wider targets

### Hypothesis

Raising `max_risk_per_trade_pct` from 0.1 → 0.5 will let larger
positions through the cap (more dollar risk available per trade),
so we'll see more trades. Combined with raising `risk_reward` from
2.0 → 3.0, the trades will hit target less often but pay more when
they do.

Predicted directional effects:
- Trades executed ↑ (3 → 4-6)
- Win rate ↓ (33% → ~25%)
- Position cap rejections ↓ (was 84)

### Knobs changed

| Field | Baseline | Experiment |
|---|---|---|
| `risk.max_risk_per_trade_pct` | 0.1% | **0.5%** |
| `strategy.vwap_pullback.target.risk_reward` | 2.0 | **3.0** |

### Run IDs

- **Baseline**: `20260529-052036-7697908e`
- **Experiment**: `20260529-052500-7697908e`

### Outcome

| Metric | Baseline | Experiment | Δ |
|---|---|---|---|
| Total trades | 3 | **0** | -3 |
| W / L | 1 / 2 | 0 / 0 | — |
| Win rate | 33.3% | 0% | — |
| Total R | +0.000 | +0.000 | 0 |
| Max drawdown | -2.000R | 0.000R | +2.0R |
| Profit factor | 1.000 | — | — |
| **Total rejections** | **117** | **133** | +16 |
| – Position Value Exceeds Cap | 84 | **115** | +31 |
| – Consecutive Losses Reached | 21 | 0 | -21 |
| – No New Trades After | 12 | 18 | +6 |

### Lesson

**Hypothesis falsified in the opposite direction.** Raising risk per
trade made the cap *more* binding, not less. The correct algebra:

$$ \text{stop\_distance} \geq \frac{\text{risk\_dollars} \times
\text{entry}}{\text{cap}} $$

- At 0.1% risk: stop must be ≥ ($25 × $525) / $25,000 = **$0.53**.
  The strategy's natural stops are $0.30–$0.60; some squeak through.
- At 0.5% risk: stop must be ≥ ($125 × $525) / $25,000 = **$2.63**.
  No natural stop ever reaches that.

So raising risk per trade *scales qty up* (more shares per dollar
risk), which scales the nominal position up, which makes the cap
harder to satisfy. The cap was working as a *minimum-stop-distance
filter* in disguise.

**Takeaways:**

1. If you want more trades, **lower** risk per trade (e.g., 0.05%),
   not raise it. Counter-intuitive but follows from the cap algebra.
2. The position cap and risk-per-trade are in *tension*, mediated by
   the strategy's stop distance. Tighter stops + higher risk = bigger
   nominal positions = more cap rejections.
3. The R:R change (2 → 3) couldn't be evaluated because 0 trades
   fired. To test R:R sensitivity, hold risk at 0.1% and only move
   R:R.
4. **Always do the cap algebra before running an "increase risk"
   experiment** — the answer is often that the cap will bind harder.

---

## Experiment 003 — 2026-05-29 — Lower risk per trade unlocks the cap

### Hypothesis

Direct test of Experiment 002's lesson: the position cap acts as a
*minimum-stop-distance filter in disguise*. Lowering risk per trade
should drop the required stop-distance threshold from $0.53 to
$0.26 on SPY @ $525, which should let almost every signal fit
under the cap.

Predicted directional effects:
- Trades executed ↑ a lot (3 → 10-20+)
- Position cap rejections ↓ a lot (was 84)
- Absolute $ P&L per trade ↓ (only $12.50 risk each)
- Total R direction: uncertain — more trades means more samples
  of whatever edge (or lack thereof) the strategy has.

### Knobs changed

| Field | Baseline | Experiment |
|---|---|---|
| `risk.max_risk_per_trade_pct` | 0.1% | **0.05%** |

(All other knobs identical: account $25,000, cap 100%,
`max_consecutive_losses` 2, OR 15 min, R:R 2.0, stop buffer 0.05%,
`max_distance_from_vwap_pct` 0.25%.)

Saved as `backend/config/presets/low-risk.yaml` so this experiment
is rerunnable: `make backtest CONFIG=config/presets/low-risk.yaml`.

### Run IDs

- **Baseline**: `20260529-053746-7697908e`
- **Experiment**: `20260529-053723-7697908e`

Both ran against `data/raw/spy_5m_sample.csv` (fingerprint
`7697908e`).

### Outcome

| Metric | Baseline | Experiment | Δ |
|---|---|---|---|
| Total trades | 3 | **7** | +4 |
| W / L | 1 / 2 | 2 / 2 | — |
| Win rate | 33.3% | 28.6% | -4.7 pp |
| Total R | +0.000 | **+5.203** | +5.2R |
| Avg R / trade | 0.000 | +0.743 | +0.74R |
| Max drawdown | -2.000R | -2.000R | 0 |
| Profit factor | 1.000 | **2.000** | 2× |
| **Total rejections** | **117** | **3** | **-114** |
| – Position Value Exceeds Cap | 84 | 0 | -84 |
| – Consecutive Losses Reached | 21 | 0 | -21 |
| – No New Trades After | 12 | 2 | -10 |
| – Max Trades Per Day Reached | 0 | **1** | +1 |

### Lesson

**Hypothesis confirmed in direction, partially wrong in magnitude.**
The cap-as-stop-distance-filter model is correct: dropping the
required stop from $0.53 to $0.26 freed almost all signals from
the cap (84 → 0 rejections). Total trades went 3 → 7 (predicted
10-20+; actual was lower because a different constraint stepped
in — see below).

**New finding from the experiment:** with the cap relaxed, the
binding constraint shifted to `max_trades_per_day: 3`. The
experiment had 1 `max_trades_per_day_reached` rejection (baseline
had 0). That's the chain of binding constraints visible in the
data:

```
Default config: position cap binds → very few trades.
Low-risk config: cap relaxes → max-trades-per-day starts to bind.
```

The strategy *can* find more than 3 setups per session — the rule
is just capping it at 3.

**Two more bits worth recording:**

1. Win rate dropped (33.3% → 28.6%) but Total R went up dramatically
   (+0 → +5.2R) and profit factor doubled (1.0 → 2.0). Win rate is
   a misleading headline metric — Total R and profit factor are
   more honest. The extra trades the strategy got to take were
   slightly worse on average than the few it took at higher risk,
   but the math still favors the bigger sample.
2. **Sample size warning:** 7 trades is still tiny. The +5.2R could
   be noise. Before drawing strategic conclusions, this experiment
   should be replicated on 2+ weeks of real yfinance data
   (`make backtest-real DATA=spy_5m_2026-04-01_2026-04-15.csv
   CONFIG=config/presets/low-risk.yaml`).

### Engineering note

Initial run produced a run-id collision: both backtests completed
within the same second, both got `run_id` `20260529-053723-...`
(the engine's run-id format is `YYYYMMDD-HHMMSS-<fingerprint>`).
The second backtest's output silently overwrote the first. Reran
the baseline 23 seconds later to get a distinct run id. **TODO:**
the run-id generator should append milliseconds (or a monotonic
counter) to guarantee uniqueness when runs happen rapidly. Not
blocking but worth fixing.

---

## Experiment 004 — 2026-05-29 — Real-data preset sweep + lockout bug

### Hypothesis

Casual observation across the synthetic-fixture runs: win rate
never goes above 33.3%. Predicted: this is small-sample noise
(3-7 trades per run is too few to mean anything). On real data
with the cap relaxed, expect 30+ trades, a stable win rate ~30-40%
(consistent with 2:1 R/R breakeven), and one of the four presets
should produce a measurable edge if any does.

### Knobs changed

A four-preset sweep over a single real-data file
(`spy_5m_2026-04-29_2026-05-28.csv`, 1,634 bars, ~21 sessions).

| Preset | Differs from default at |
|---|---|
| `default` | (baseline, no changes) |
| `low-risk` | `risk.max_risk_per_trade_pct: 0.1 → 0.05` |
| `demo` | `risk.max_position_value_pct: 100 → 1500` |
| `aggressive` | `risk.max_risk_per_trade_pct: 0.1 → 1.0`; `max_consecutive_losses: 2 → 4`; `risk_reward: 2.0 → 3.0` |

### Run IDs

Pre-fix (lockout permanent — see "Engine bug" below):

- default: `20260529-133508-421a5b44`
- low-risk: `20260529-133510-421a5b44`
- demo: `20260529-133512-421a5b44`
- aggressive: `20260529-133515-421a5b44`

Post-fix (consecutive_losses now resets per session):

- default: `20260529-133808-421a5b44`
- low-risk: `20260529-133812-421a5b44`
- demo: `20260529-133815-421a5b44`
- aggressive: `20260529-133819-421a5b44`

All ran against `data/raw/spy_5m_2026-04-29_2026-05-28.csv`
(fingerprint `421a5b44`, distinct from the synthetic fixture's
`7697908e`).

### Engine bug discovered mid-experiment

Initial sweep produced suspiciously uniform results: three of four
presets all returned **2 trades, 0/2 W/L, -2.000R, 402 rejections,
100% of them `consecutive_losses_reached`**.

Investigation revealed the consecutive-loss lockout was a
**permanent catch-22** on real data:

1. After 2 losses, `state.consecutive_losses >= max_consecutive_losses`
   so the risk manager rejects every subsequent signal.
2. `consecutive_losses` was only reset on a winning trade
   (`engine.py:_apply_exit_to_state`).
3. With every signal rejected, no winning trade can ever happen
   to reset the counter.
4. `RiskState.roll_to_session` reset `trades_taken_today`,
   `daily_realized_pnl`, `daily_lockout_active`, and `cooldown_until`
   — but NOT `consecutive_losses`. An explicit pre-existing test
   (`test_roll_to_session_does_not_clear_consecutive_losses`)
   asserted this behavior.

On the synthetic fixture this never showed up because the strategy
happened to win Trade 3, resetting the counter before the catch-22
locked in. On the real 21-session fixture, the first 2 trades both
lost — and the lockout fired for the remaining 400+ signals.

**Fix:** added `self.consecutive_losses = 0` to `roll_to_session`,
matching every other "daily" counter. Flipped the test to assert
the new behavior with a comment explaining the catch-22.

### Outcome (post-fix)

| Metric | default | low-risk | demo | aggressive |
|---|---|---|---|---|
| Total trades | 37 | **44** | **44** | 0 |
| Wins / Losses | 11 / 23 | 15 / 27 | 15 / 27 | — |
| Win rate | 29.7% | **34.1%** | **34.1%** | — |
| Total R | +0.739 | **+3.453** | **+3.453** | 0 |
| Max drawdown | -12.000R | -7.131R | -7.131R | 0 |
| Profit factor | 0.950 | **1.105** | **1.105** | — |
| Total rejections | 122 | 144 | 144 | 411 |

(Pre-fix outcomes deliberately not included — they reflect the bug,
not the strategy.)

### Lesson

**Three findings, in order of importance:**

1. **The consecutive-loss lockout was a permanent catch-22 on real
   data.** Fixed by resetting `consecutive_losses` per session. This
   bug was undetectable on the synthetic fixture by luck (Trade 3
   happened to be a winner) and only surfaced because we ran the
   four-preset sweep on real data and noticed three of four configs
   produced byte-identical losing outcomes. **Real-data backtests
   catch bugs synthetic data hides.** Lesson for future: always
   validate findings on real data before drawing strategic
   conclusions.

2. **Win-rate observation was correct but small-sample.** The user's
   sense that "we never go above 33.3%" was real: across 44 trades
   on the real-data sample, win rate stabilizes at 34.1%. That's
   *just barely above* the 33.3% breakeven for 2:1 R/R. The strategy
   has marginal edge, not meaningful edge. Profit factor 1.105 says
   the same thing.

3. **`low-risk` and `demo` continue to produce identical R-outcomes.**
   On synthetic and on real data alike, both presets fully relax the
   cap, so both take the same trades. R-multiples are
   capital-invariant — the only difference between the two runs is
   the dollar P&L per trade (demo's would be 2× low-risk's), which
   the R-based summary metrics hide.

**Next-experiment suggestions:**

- **Test R:R sensitivity.** Drop `risk_reward` from 2.0 → 1.5 on the
  low-risk preset. Expect higher win rate (~45%), lower R per win,
  similar or better Total R. Tests whether 2:1 is fighting against
  the data.
- **Test a longer window.** `make download START=2026-02-28
  END=2026-05-28` for 90 days → ~63 sessions. Re-sweep. See if
  PF 1.1 holds at a bigger sample.
- **Audit `aggressive` preset.** It's been confirmed unrunnable on
  both synthetic and real data (411 rejections, 0 trades).
  Either remove it or pair it with a strategy code change that
  produces wider stops.

---

## Experiment 005 — 2026-05-29 — Five-knob sensitivity sweep

### Hypothesis

With the consecutive-loss bug fixed and a clean real-data baseline
(low-risk preset, PF 1.105), sweep five single-knob tweaks
independently to find which dial moves the strategy's edge. A
controlled comparison — same data, same code, one knob at a time.
The "trend" is whatever direction PF and Total R consistently move
as the knob varies.

Going in, I expected:
- R:R sensitivity: monotonic — lower R:R higher WR, higher R:R
  higher per-win. Direction of PF unclear.
- VWAP distance: stricter (smaller) = higher quality = better PF.
- max_trades_per_day: not binding in baseline (was 3 in the
  rejection breakdown); should not move much.

### Knobs changed

All five tweaks are single-knob deltas from the `low-risk` preset
(`backend/config/presets/low-risk.yaml`):

| Tweak ID | Field | Baseline | Variant |
|---|---|---|---|
| A | `strategy.vwap_pullback.target.risk_reward` | 2.0 | **1.5** |
| B | `strategy.vwap_pullback.target.risk_reward` | 2.0 | **2.5** |
| C | `strategy.vwap_pullback.max_distance_from_vwap_pct` | 0.25 | **0.10** |
| D | `strategy.vwap_pullback.max_distance_from_vwap_pct` | 0.25 | **0.50** |
| E | `risk.max_trades_per_day` | 3 | **5** |

Temp configs in `backend/config/_sweep/`; not committed — the
sweep is reproducible by running the same five seds against
`low-risk.yaml`.

### Run IDs

All ran against `data/raw/spy_5m_2026-04-29_2026-05-28.csv`
(fingerprint `421a5b44`, 1,634 bars over ~21 sessions).

- baseline (low-risk): `20260529-134337-421a5b44`
- A (R:R 1.5): `20260529-134418-421a5b44`
- B (R:R 2.5): `20260529-134421-421a5b44`
- C (VWAP 0.10): `20260529-134424-421a5b44`
- D (VWAP 0.50): `20260529-134428-421a5b44`
- E (mtpd 5): `20260529-134431-421a5b44`

### Outcome

| Run | Trades | W/L | Win % | Total R | Max DD | PF |
|---|---|---|---|---|---|---|
| baseline | 44 | 15/27 | 34.1% | +3.45 | -7.13R | 1.105 |
| A (R:R 1.5) | 54 | 24/30 | **44.4%** | +5.62 | -10.07R | 1.187 |
| B (R:R 2.5) | 42 | 12/27 | 28.6% | +6.62 | **-5.65R** | 1.159 |
| C (VWAP 0.10) | 37 | 13/23 | 35.1% | +2.10 | -6.06R | 1.121 |
| D (VWAP 0.50) | 46 | 17/25 | 37.0% | **+10.47** | -8.06R | **1.357** |
| E (mtpd 5) | 48 | 16/29 | 33.3% | +3.44 | -8.13R | 1.097 |

### Lesson — three trends

**Trend 1: R:R is U-shaped, not monotonic.**

Both 1.5 (PF 1.187) and 2.5 (PF 1.159) outperform the 2.0 baseline
(PF 1.105). They get there via different shapes:

- 1.5: 44.4% WR with smaller per-win → many small winners
- 2.5: 28.6% WR with bigger per-win → fewer big winners

The 2.0:1 setting sits in a *trough* between two better
strategies. Conventional wisdom says "2:1 R/R is the sweet spot
for intraday." That's not what this data says. The implication: the
"right" R:R depends on the strategy's natural win-rate distribution
— and 2.0 happens to be where neither the wins-many-small nor
wins-few-big strategy fully kicks in.

**Trend 2: Looser VWAP distance dominates — counterintuitively.**

| VWAP distance | Total R | PF |
|---|---|---|
| 0.10 | +2.10 | 1.121 |
| 0.25 (baseline) | +3.45 | 1.105 |
| 0.50 | +10.47 | 1.357 |

Monotonically better as the threshold loosens. This is **opposite**
the usual "tighter filter = higher quality" intuition.

Possible mechanism: when SPY pulls back so close to VWAP (≤0.10%)
that the close practically *touches* the line, the next move is
usually continuation *through* VWAP (failure). At 0.50%, the
strategy is catching pullbacks that bounced off some independent
support level (prior bar high) *before* touching VWAP — these are
stronger setups. The threshold isn't a quality filter; it's a
"how-much-strength-required" filter, and more strength is better.

**Worth testing:** push the threshold further (0.75%, 1.0%, 1.5%).
If the trend keeps going, there's a real signal. If it reverses,
we've found the optimum.

**Trend 3: `max_trades_per_day` is not binding here.**

Raising 3 → 5 produced essentially identical results (+3.44 vs
+3.45 Total R). The cap wasn't doing real work in the baseline.
Slack constraint — drop the knob from active research.

### Tentative new "best config" (subject to longer-data confirmation)

```yaml
# low-risk + tweak D (VWAP distance 0.50)
risk:
  account_value: 25000.0
  max_risk_per_trade_pct: 0.05
  max_position_value_pct: 100.0
  max_consecutive_losses: 2
strategy:
  vwap_pullback:
    max_distance_from_vwap_pct: 0.50    # <-- the winning change
    target:
      risk_reward: 2.0
```

PF 1.357, Total R +10.47 over 46 trades. Drawdown only marginally
worse than baseline (-8.06 vs -7.13). This is the highest-edge
result we've recorded.

### Cautions

- **Sample sizes are 37-54 trades.** Real but not large. Each
  result has roughly ±10% noise on PF.
- **One month of one market regime.** May 2026 may be a quiet
  regime; June could behave differently. Replicate on a longer
  window (60-day yfinance limit) before treating "D" as the new
  default.
- **The R:R U-shape could be artifact.** Two data points on either
  side of the trough is thin evidence. Test R:R 1.25 and 3.0 to see
  if the U holds.

### Next experiments (in order of expected information yield)

1. **Push VWAP distance higher (0.75, 1.0, 1.5).** If Trend 2 holds,
   we may not have found the optimum yet.
2. **Combine D + A or D + B** — does looser VWAP × tighter or wider
   R:R compound, or do they interact?
3. **Re-run sweep on a 60-day window.** Same five tweaks. If the
   trends survive a 2× larger sample, they're real signals.
4. **Promote D config to a named preset** (`backend/config/presets/<name>.yaml`)
   if it survives (3).

---

## Experiment 006 — 2026-05-30 — Doubling the position cap unblocks the bottleneck

### Hypothesis

Raising `max_position_value_pct` from 100 → 200 will unlock most of the
99 `position_value_exceeds_cap` rejections from the baseline. Trade
count should jump significantly; profitability should improve because
the cap was blocking trades indiscriminately rather than filtering for
quality. Companion test to Experiment 003 (which tackled the same
bottleneck from the other side — lowering risk-per-trade).

### Knobs changed

| Field | Baseline | Experiment |
|---|---|---|
| `risk.max_position_value_pct` | 100.0 | **200.0** |

All other knobs identical: account $25,000, `max_risk_per_trade_pct`
0.1%, `max_consecutive_losses` 2, OR 15 min, R:R 2.0, stop buffer
0.05%, `max_distance_from_vwap_pct` 0.25%, all market/session times
unchanged.

### Run IDs

- **Baseline**: `20260530-151016-7697908e`
- **Experiment**: `20260530-160053-7697908e`

Both ran against `data/raw/spy_5m_sample.csv` (fingerprint `7697908e`).
Same `code_version: fa20a62812aa0b74c89d3334768c226eca30b712`.

### Outcome

| Metric | Baseline | Experiment | Δ |
|---|---|---|---|
| Total trades | 3 | 7 | +4 |
| Wins / Losses | 1 / 2 | 2 / 2 | +1W, ±0L |
| Force-flats (neither W nor L) | 0 | 3 | +3 |
| Win rate | 33.3% | 28.6% | −4.7pp |
| Total R | 0.000 | +5.203 | +5.203 |
| Average R | 0.000 | +0.743 | +0.743 |
| Best trade R | +2.0 | +2.0 | — |
| Worst trade R | −1.0 | −1.0 | — |
| Profit factor | 1.00 | 2.00 | +1.00 |
| Max drawdown | −2.0R | −2.0R | — |
| Rejected signals | 117 | 3 | −114 |
| └ `position_value_exceeds_cap` | 99 | 0 | −99 |
| └ `no_new_trades_after` | 18 | 2 | −16 |
| └ `max_trades_per_day_reached` | 0 | 1 | +1 |

### Lesson

Confirmed. Cap rejections 99 → 0; trades 3 → 7; total R 0.0 → +5.2.
The baseline's `total_r: 0` was a cap artifact, not a strategy
property — the cap was filtering signals randomly with respect to
outcome, not selectively keeping winners. Win rate dipped (33% →
29%) but profit factor doubled (1.0 → 2.0) because absolute winners
went 1 → 2, and at 2R:1R that pays for several losses.

Three notable observations:

1. **Trade count saturated at 7, not 99.** Once cap is unblocked,
   other gates take over: `max_trades_per_day: 3` (× 3 days = 9
   ceiling) and `no_new_trades_after: 15:30` together kept the
   number to 7. Future runs may want to test relaxing the daily
   cap on longer windows.
2. **Force-flats jumped 0 → 3.** With more entries firing later in
   the morning, more trades run out of session before reaching
   target. Worth monitoring — if >50% of outcomes go force-flat,
   the holding period is misaligned with the no-new-trades cutoff.
3. **n=7 is not statistical.** The +5.2R could be one favourable
   week. Next test: same `cap=200` config on the 21-session window
   (`spy_5m_2026-04-29_2026-05-28.csv`) to see if average R holds
   at ~0.7 or regresses.

Cross-reference: Experiment 003 unlocked the same bottleneck by
lowering `max_risk_per_trade_pct` instead. Worth comparing the two
approaches side-by-side on a longer window — they have different
P&L scaling properties (Exp 003 reduces dollar risk per trade; this
one keeps it constant but adds notional exposure).

---

## Experiment 007 — 2026-06-04 — Walk-forward: 2:1 vs 3:1 target (first OOS test)

> First **out-of-sample** experiment in this log. Everything above is
> in-sample (one backtest over one window); this one uses the Feature 011
> walk-forward engine over real configs (the Feature 012 unlock) — 12 rolling
> windows across 2018–2024, each validating on data its 12-month training
> window never saw. The 2025–26 lockbox stayed untouched.

### Hypothesis

Raising the take-profit from 2:1 to 3:1 will *lower* win rate (a wider target
is hit less often) but *raise* expectancy if the bigger winners more than pay
for the extra misses — and, more importantly, it will hold up **out-of-sample**
rather than just in-sample. Prediction: 3:1 wins on expectancy but both are
weak/noisy.

### Knobs changed

| Field | Config A (`default`) | Config B (`wf-rr3`) |
|---|---|---|
| `strategy.vwap_pullback.target.risk_reward` | 2.0 | **3.0** |

Both at `max_position_value_pct: 400`, account $25,000, risk 0.1%, OR 15 min,
stop buffer 0.05%, max dist VWAP 0.25%. Net-of-cost ($0.01/share slippage).

### Study IDs (persisted, visible in the Validation UI)

- **Config A `default`**: `72f60493-bc5d-4b88-9159-540429aa3d22`
- **Config B `wf-rr3`**: `841a94ff-0969-40aa-bdca-9aed813978ca`

Pool 2018-01-01 → 2024-12-31 (lockbox 2025-01-01 → 2026-12-31 held out);
137,306 SIP bars; 12 windows × IS+OOS each.

### Outcome (means across the 12 OOS windows)

| Metric | A — 2:1 | B — 3:1 |
|---|---|---|
| Mean OOS expectancy ($/trade) | +0.19 | **+0.95** |
| Mean IS→OOS gap (expectancy R) | 0.0153 | **0.0054** |
| OOS win rate | ~30% | ~20% |
| OOS trades / window | ~250 | ~220 |
| OOS per-window expectancy$ range | −3.54 … +3.14 | −4.23 … +4.57 |

### Lesson

Hypothesis broadly confirmed. The 3:1 target is the better candidate on *both*
axes that matter for trusting an edge: higher mean OOS expectancy (+$0.95 vs
+$0.19/trade) **and** a smaller in-sample→out-of-sample decay (0.005 vs 0.015 R),
i.e. it overfits less. The lower win rate (~20%) is expected and fine — at 3:1
the fewer winners are bigger.

**But this is a weak, noisy signal, not a green light.** OOS expectancy swings
hard window-to-window (one −$4.23, another +$4.57), and a positive *mean* across
12 windows is well within "could be luck." On a $25k account at ~0.1% risk/trade,
+$0.95/trade ≈ 0.04R — small. The honest next step is **significance** (bootstrap
CI + random-entry permutation) to ask whether the OOS expectancy is
distinguishable from random entries. Only if it survives that should the one-shot
**lockbox** (2025–26) ever be spent on `wf-rr3` — and not before.

Methodological note: this is the first experiment here that *can't* be fooled by
in-sample fitting, because the metric is OOS by construction. Prior experiments
(001–006) measured in-sample behavior on a single window; treat their "edges"
with more suspicion than this one.

---

## Experiment 008 — 2026-06-07 — Full-span knob sweeps: nothing rescues the always-on strategy

### Hypothesis

After the auto-research campaign (feature 019) halted with *stop-tuning*, the
open question was: **is the strategy dead, or just the config?** Sweep every
signal-shaping knob across its sensible range at full train-span (2018–2022,
~2,000+ trades per point) and let the surfaces answer.

### Setup

Sensitivity studies on `default` (R:R 3.0, cap 1200%), train segment, total-R
metric: `risk_reward` {1.5, 2, 2.5, 3} (bf42dd85), `max_distance_from_vwap_pct`
{0.1, 0.25, 0.5, 1.0}, `opening_range.minutes` {10, 15, 20, 30},
`stop.buffer_pct` {0, 0.05, 0.1, 0.2}.

### Outcome

| Knob | Best point | Best total R | Current point |
|---|---|---|---|
| risk_reward | 3.0 | −0.54 | (is current) |
| vwap distance | 0.5 | **+4.08** | 0.25 → −0.54 |
| opening range | 15 | −0.54 | (is current) |
| stop buffer | 0.10 | **+3.95** | 0.05 → −0.54 |

### Lesson

**No knob rescues the always-on strategy.** Two real ridges exist (wider VWAP
band — confirming Experiment 005's one-month hint at full span — and a doubled
stop buffer), but both are ~+0.002 R/trade: an order of magnitude under the
0.01 R/trade evidence bar, and the recommendation engine correctly refused to
suggest them. Every other direction is flat or worse (no stop buffer = −18.5R,
death by wick). Combined with 007's noisy OOS verdict: the *config space* is
exonerated — whatever is wrong with vwap-pullback is not a tuning problem.

---

## Experiment 009 — 2026-06-07 — Entry-window: a diagnostic slice fails the intervention test

### Hypothesis

A per-trade diagnostic of the R:R=2.0 run (166b9671) showed entries in the
first ~15 minutes after the opening range carried the strategy's ENTIRE net
loss (651 trades, −125.9R, 29% win) while 10:00–14:00 entries were net positive
(+60R, 37–41% win), stably across all five years. Hypothesis: an entry-window
filter (start ≥ 30 min after open) turns the strategy around. Feature 020 built
the knob; this sweep judged it.

### Setup

Sensitivity study f0847935 on `default`, train segment:
`entry_window.start_minutes_after_open` {0, 15, 30, 45}.

### Outcome

| start (min after open) | total R | trades |
|---|---|---|
| 0 (baseline) | −0.54 | 2,181 |
| 15 | −0.54 | 2,181 |
| **30** | **−11.91** | 2,065 |
| 45 | −7.22 | 1,998 |

### Lesson

**Hypothesis refuted — skipping the open made it WORSE.** The slice arithmetic
("remove the −126R cohort, keep the +60R rest") silently assumed trades are
independent. They are not: with the morning slot empty, the engine takes a
*different* trade sequence all day — one-position-at-a-time, cooldowns and
lockouts all reshuffle. A conditional slice is a correlation; only running the
intervention through the engine is causal. (Also note start=15 ≡ start=0: the
opening range already gates the first 15 minutes — a built-in consistency
check that the knob behaves.)

Verdict after 008+009: vwap-pullback has **no surviving rescue hypothesis** —
config knobs, timing, all honestly tested. Next research must change the
strategy logic itself (regime conditioning or a second entry setup), not its
parameters. The entry-window knob remains: every future strategy gets honest
time-of-day search for free.

---

<!--
Append new experiments below this line. Use the next sequential ID
(EXPERIMENT_LAST + 1) zero-padded to 3 digits. Never edit historical
entries — if you want to revise an insight, write a new experiment
that references the old one.
-->
