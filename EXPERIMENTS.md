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

<!--
Append new experiments below this line. Use the next sequential ID
(EXPERIMENT_LAST + 1) zero-padded to 3 digits. Never edit historical
entries — if you want to revise an insight, write a new experiment
that references the old one.
-->
