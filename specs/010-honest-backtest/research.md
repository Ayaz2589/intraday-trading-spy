# Phase 0 Research: Make the Backtest Honest

All decisions resolve cleanly; no remaining NEEDS CLARIFICATION. The four spec-level clarifications (costs, dead-knobs, Sharpe basis, equity base) are recorded in [spec.md](./spec.md#clarifications). This file resolves the *implementation* unknowns.

---

## D1 — How costs attach to fills

**Decision**: Slippage is baked into **fill prices** (adverse), fees are a **flat per-share deduction** on each side. `PaperBroker` is constructed with `cfg.broker` so it knows `fees_per_share` and `slippage_per_share`.

- **Entry** (long): `entry_price = next_bar.open + slippage_per_share` (you pay up).
- **Stop exit**: `exit_price = stop − slippage_per_share` (you get less).
- **Target exit**: `exit_price = target − slippage_per_share`.
- **Force-flat exit**: `exit_price = next_bar.open − slippage_per_share`.
- **Fees**: `fees = fees_per_share × quantity × 2` (entry + exit), subtracted from PnL.
- **Per-trade PnL**: `gross_pnl = (exit_price − entry_price) × quantity`; `net_pnl = gross_pnl − fees`. The journal records `gross_pnl`, `fees`, `slippage_cost`, and `net_pnl`; `realized_pnl` becomes the **net** figure (so existing readers see net automatically).

**Rationale**: Slippage is fundamentally a worse fill price, so modeling it on price keeps `realized_r` (price-based) honest too; fees are a fixed cost independent of price, so they're a separate line. Mirrors how a real broker statement reads. Adverse-only guarantees slippage never *helps* (spec edge case).

**Slippage and R**: `realized_r` stays price-based (it already reflects the slippage-adjusted fill prices). Fees are *not* folded into R (R is a price/risk ratio); instead expectancy and all `$` metrics use **net `$`**, and expectancy is also reported in R for continuity. This keeps R interpretable while `$` is fully net.

**`same_bar` stop-before-target** (existing FR-009 behavior) is preserved: when a bar hits both, the stop fills first; slippage still applies to that stop fill.

**Alternatives rejected**:
- *Slippage as a flat $ deduction like fees* — loses the price-level realism and would make `realized_r` overstate the fill; rejected.
- *Spread/volatility-aware slippage* — explicitly out of scope (spec Assumptions); a fixed per-share amount matches the existing config field.

**Risk-state consistency**: `engine._apply_exit_to_state` already accumulates `pos.realized_pnl` into `daily_realized_pnl` (drives the daily-loss lockout). Because `realized_pnl` is now net, the lockout trips on net losses — strictly more conservative, consistent with constitution III. A test will assert lockout uses net PnL.

---

## D2 — Cost defaults

**Decision**: `broker.fees_per_share: 0.0`, `broker.slippage_per_share: 0.01` in `config.yaml`. (Pydantic defaults in `BrokerConfig` updated to match so code-only runs are also net.)

**Rationale**: Alpaca (the execution broker we're targeting, Phase 3) is commission-free for US equities → `$0` fees. `$0.01/share` is a conservative-but-realistic adverse slip for a liquid ~$500 ETF whose top-of-book spread is typically 1–2¢ — roughly half-to-full spread each side. Per spec clarification.

---

## D3 — Expectancy

**Decision**: Report expectancy two ways:
- **Expectancy (R)** = `win_rate × average_win_r − loss_rate × |average_loss_r|`, where `loss_rate = losses / total_trades`.
- **Expectancy ($)** = `total_net_pnl / total_trades` (mean net `$` per trade).

**Rationale**: The R form is the spec's stated formula and is scale-invariant; the `$` form is the intuitive "average dollars per trade" and is fully net. Decisive wins/losses define the R rates (consistent with the existing `wins`/`losses` definition: target=win, stop=loss; force-flat is neither).

---

## D4 — Sharpe & Sortino (daily-return basis)

**Decision**: Aggregate net `$` PnL per **trading session date** → `daily_return = daily_net_pnl / account_value` (fixed base = `risk.account_value`). Then:
- `Sharpe = mean(daily_returns) / stdev(daily_returns) × √252` (rf = 0).
- `Sortino = mean(daily_returns) / downside_deviation × √252`, where `downside_deviation = sqrt(mean(min(r,0)²))` over all daily returns.
- Annualization factor `252` and `rf=0` live in `config.yaml` (`metrics.trading_days_per_year`, `metrics.risk_free_rate`).

**Rationale**: Daily-return Sharpe is the conventional, comparable form (spec clarification). Using a fixed `account_value` base makes daily returns well-defined and, under fixed-fractional sizing, scale-invariant. Sample stdev (n−1) is used; both are `None` when fewer than 2 trading days exist (see D8).

**Alternatives rejected**: per-trade R Sharpe (simpler but not comparable to quoted Sharpe figures) — rejected per clarification.

---

## D5 — Drawdown ($ and %) and equity curve

**Decision**: Build an **equity curve** as an ordered series over completed trades (decisive + force-flat, in exit order): `equity[i] = account_value + cumulative_net_pnl_through_trade_i`, with `equity[0] = account_value` (starting point).
- **Max drawdown ($)** = max over the curve of `running_peak − equity` (a non-negative dollar figure).
- **Max drawdown (%)** = max over the curve of `(running_peak − equity) / running_peak` (fraction, ×100 for display).
- The equity curve series (timestamp + equity + cumulative net PnL) is included in the run summary for the frontend sparkline.

**Rationale**: Standard peak-to-trough on an account-anchored equity curve. `account_value` anchor (per clarification) makes `%` interpretable as real account drawdown and keeps it scale-invariant. Retains the existing `max_drawdown_r` (R-based) for continuity; adds `$`/`%` alongside.

**Note**: The existing `metrics.py` computes drawdown in R over the per-trade R series — that logic is generalized to also walk the net-`$` equity curve.

---

## D6 — Return distribution

**Decision**: Over the **net per-trade `$`** series (completed trades): `median`, `stdev` (sample, n−1), and `skew` (Fisher-Pearson adjusted moment coefficient). All `None` when `n < 2` (stdev/skew) or `n < 3` (skew specifically); documented in D8.

**Rationale**: Reveals reliance on a few lucky trades (spec metrics glossary). Computed with the standard library / pandas — no new dependency.

---

## D7 — Per-bucket breakdown

**Decision**: Group completed trades by **entry timestamp** converted to `America/New_York`:
- **hour-of-day** (09, 10, …, 15),
- **weekday** (Mon–Fri),
- **month** (1–12, or YYYY-MM — see below).

Each bucket reports: `trade_count`, `net_pnl_dollars`, `win_rate`, `expectancy_r`. Buckets are keyed by the natural label; empty buckets are omitted.

**Month granularity decision**: bucket by **calendar month-of-year (1–12)** for the "where does edge live" lens (seasonality), since runs span ~8 years and a YYYY-MM list would be unwieldy in the card. (Cross-run / per-period analysis is Phase 2's job.)

**Rationale**: Entry time is when the decision was made — the meaningful attribution point. NY-local via `clock.py` keeps hour/weekday correct regardless of storage tz.

---

## D8 — Empty / degenerate inputs

**Decision** (graceful, no exceptions):
- `total_trades == 0`: expectancy, win-rate CI, Sharpe, Sortino, drawdown-%, distribution → `None`; counts → 0; equity curve → `[account_value]` (flat).
- `1` trade: CI maximally wide (and flagged noise); Sharpe/Sortino/skew → `None` (need ≥2 days / ≥3 points); stdev → `None` (`n<2`).
- All wins / all losses: `profit_factor` stays `None` (existing behavior); Sortino `None` when downside deviation is 0 (no losing days); flagged in UI as undefined, not `0`/`inf`.

**Rationale**: Division-by-zero and misleading `0.0`s are the exact self-deception this feature fights. `None` renders as "—" with a tooltip explaining why.

---

## D9 — Win-rate confidence interval

**Decision**: **Wilson score interval** at 95% (`z = 1.96`) on the win proportion (decisive wins / total trades). Report `[low, high]`. Confidence level lives in `config.yaml` (`metrics.win_rate_ci_confidence: 0.95`).

**Rationale**: Wilson is well-behaved at small `n` and near 0/1 (where the normal-approx interval breaks) — exactly the small-sample regime we need to flag honestly. No new dependency (closed-form).

---

## D10 — Low-confidence ("noise") threshold

**Decision**: `metrics.low_confidence_trade_count: 30` in `config.yaml`. Results with `total_trades < 30` get a `low_confidence: true` flag in the summary and a visible "noise" badge + tooltip in the UI.

**Rationale**: ~30 is a conventional small-sample heuristic; configurable, not hardcoded. The flag is advisory (doesn't block), matching the educational intent.

---

## D11 — Equity-curve rendering (frontend)

**Decision**: Render the equity curve as a **dependency-free inline SVG sparkline** component (`equity-curve.tsx`), fed the summary's equity series. No new charting library; the existing klinecharts price chart is candlestick-oriented and heavyweight for a simple monotone line.

**Rationale**: Smallest, lowest-risk surface; avoids a new dependency and avoids overloading the price chart. A line with a baseline at `account_value`, profit/loss-toned fill, and a `HelpTooltip` satisfies VI. Recharts/lightweight-charts were considered but rejected to avoid a new dep for one simple chart.

---

## D12 — Persistence / API shape

**Decision**: `runs.summary` is **JSONB** — new fields are additive with **no migration**. Extend, in lockstep:
- local `SummaryMetrics` (`models.py`) → serialized to `summary.json`,
- legacy `SummaryMetricsView` (`frontend/src/api/legacy-types.ts`) consumed by `summary-metrics-card.tsx`,
- cloud `RunSummary` (`storage/models.py`) + its `push.py` mapping (set real `sharpe`, add `sortino`, `expectancy`, `max_drawdown_pct`, etc.),
- `RunSummaryView` (`api/schemas.py`) with safe defaults for legacy rows.

**Rationale**: Keeps detail-view and cross-run/aggregation summaries consistent and forward-compatible for Phase 2, with zero schema/migration risk. Defaults on the view models protect pre-010 rows.

---

## Dead-knob removal (US4) — surface

**Decision**: Delete `min_minutes_after_open` from `VwapPullbackConfig`, delete the entire `VwapPullbackConfirmationConfig` (`require_close_above_prior_bar_high`, `require_close_above_vwap`) and its `confirmation` field, and remove the corresponding `config.yaml` lines.

**Verification that this is inert**: `strategy/vwap_pullback.py` reads none of them — the VWAP gate (`bar.close > snap.vwap`) and prior-bar gate (`bar.close > snap.prior_bar_close`) are hardcoded and always on. (Bonus honesty fix: the knob was named `require_close_above_prior_bar_high` but the code compares prior-bar *close*; deleting removes the misleading name.) A regression test asserts an identical backtest result before/after removal (spec US4 scenario 2).
