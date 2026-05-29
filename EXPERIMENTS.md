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

<!--
Append new experiments below this line. Use the next sequential ID
(EXPERIMENT_LAST + 1) zero-padded to 3 digits. Never edit historical
entries — if you want to revise an insight, write a new experiment
that references the old one.
-->
