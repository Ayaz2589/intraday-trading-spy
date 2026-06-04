# Automated Trading Roadmap — SPY Intraday

> From a deterministic backtester to **validated, mostly-automated paper/live trading** — without fooling ourselves into trading a curve-fit illusion with real money.

**Status:** living document · **Audience:** us (builder/operator) · **Last grounded against code:** 2026-06-03

---

## Table of contents

1. [Purpose & the one principle that governs everything](#1-purpose)
2. [Honest framing: what kills retail algo traders](#2-honest-framing)
3. [Governing constraints (the constitution)](#3-governing-constraints)
4. [Where we are today (grounded snapshot)](#4-where-we-are-today)
5. [The phases (each is a gate)](#5-the-phases)
   - [Phase 0 — Data foundation](#phase-0--data-foundation)
   - [Phase 1 — Make the backtest honest](#phase-1--make-the-backtest-honest)
   - [Phase 2 — Validation methodology (no self-deception)](#phase-2--validation-methodology)
   - [Phase 3 — Forward paper trading](#phase-3--forward-paper-trading)
   - [Phase 4 — Manual-approval mode](#phase-4--manual-approval-mode)
   - [Phase 5 — Tiny live](#phase-5--tiny-live)
6. [Cross-cutting concerns](#6-cross-cutting-concerns)
7. [Anti-overfitting checklist](#7-anti-overfitting-checklist)
8. [Metrics glossary](#8-metrics-glossary)
9. [Open decisions](#9-open-decisions)
10. [Execution via Spec Kit](#10-execution-via-spec-kit)

---

## 1. Purpose

The goal is to **automate most of our SPY intraday trading to take emotion out of execution** — but only after we have *honest evidence* that the strategy has a real, durable edge after costs.

**Scope evolution:** we start with **SPY** and intend to **add more symbols over time**. That is a deliberate *future* expansion (see [§6](#6-cross-cutting-concerns)), not a v1 change — it requires amending the constitution (Principle I is currently SPY-only) and validating each new symbol on its own. Get one symbol provably working first; symbols are a *multiplier* on the validation and operational work, not a starting point.

**The one principle that governs this whole document:**

> Build a process whose job is to **try to prove the strategy *wrong* cheaply**, and only risk money on what refuses to die.

Most candidate configs *should* fail this process. That is the process working, not failing. Automation does not create edge — **it amplifies whatever you point it at.** Point it at a real edge and discipline compounds; point it at a curve-fit illusion and you lose money faster, more consistently, and (ironically) more calmly.

---

## 2. Honest framing

The hard truths, stated once, plainly:

- **Overfitting (curve fitting) is the #1 killer.** We have ~8 tunable knobs. With that many dials and limited history, you can make *any* past look great by fitting the **noise**. The backtest will look fantastic precisely *because* it was tuned to that data.
- **Sample size is everything.** "83% win rate on 6 trades" is coin-flip noise. You need *hundreds–thousands* of trades across varied conditions before a number means anything.
- **Zero-cost backtests lie.** Intraday strategies live and die on costs (spread, slippage, fills). An edge that's positive at zero cost is often negative once modeled.
- **In-sample selection = selecting luck.** If you pick the knobs that did best on your data, you've selected for the noise you fit to. **Out-of-sample validation is non-negotiable.**
- **Regimes change.** Knobs tuned on a trending market can fail in a choppy or bear one.
- **Base rate:** most retail intraday systems don't beat buy-and-hold after costs, and most day traders lose. Respect how hard this is.
- **Automating ≠ done.** Automated systems fail in *new* ways — outages, bad fills, partial orders, edge cases. "Mostly automated, human at the edges" (on/off, monitoring, the decision to keep trading it) is the right target, not lights-out.

> **Curve fitting vs. research — the line we walk.** Refining knobs by tuning on one period and *validating on a held-out period you never looked at* is legitimate research. Refining knobs by maximizing the backtest you can see is curve fitting. They look similar and are opposites. This document is built to keep us on the right side of that line. (See also constitution Principle II — the *strategy* stays rule-based; we are doing manual, out-of-sample-disciplined parameter research, **not** automated/ML optimization in the trading loop.)

---

## 3. Governing constraints

From `.specify/memory/constitution.md` (v1.1.0) — these are **NON-NEGOTIABLE** and shape every phase:

- **I — SPY only.** No other instruments in v1. *(We plan to add more symbols later — see [§6 Multi-symbol expansion](#6-cross-cutting-concerns). That is a post-v1 expansion that **requires amending this principle**; until then, SPY is hard-enforced.)*
- **II — Long-only, rule-based.** No shorting, no ML/HMM/sentiment. Strategy *suggests* signals; it never sizes or places orders.
- **III — Risk manager has absolute veto.** Every trade needs a stop **and** a target. Enforces max risk/trade, max daily loss, max trades/day, max consecutive losses, cooldown, max position value, no overnight, no-new-trades cutoff. (`backend/src/intraday_trade_spy/risk/manager.py`)
- **IV — Test-first everywhere.** TDD for all production code. Every behavior change starts with a failing test.
- **V — Paper-first, live disabled by default.** The build order is **fixed**:
  > `backtest → internal paper broker → Alpaca paper → manual-approval mode → (much later, maybe) tiny live`
  >
  > `live_auto_enabled: false` is enforced at **three layers** (Pydantic `Literal[False]` in `config.py`, a Postgres `CHECK` in `0002_configs.sql`, and a storage-model validator). Live order paths must be guarded by **both** `live_auto_enabled` **and** an explicit manual-readiness flag, and a test must assert the live path is unreachable by default.
  > **Live cannot be enabled without a documented review against a checklist in `docs/PAPER_TRADING.md` — which does not exist yet.** Authoring it is a hard gate.
- **VI — Educational UI.** Every new concept (slippage, equity curve, walk-forward, drawdown, kill switch…) ships with a `?` HelpTooltip answering: what is this, why does it matter, how is the app using it.
- **VII — Journal everything.** Executions, rejections, skipped setups, risk decisions, P&L events — all logged with full context, human-readable, CSV-exportable.

**Our roadmap's phases map directly onto Principle V's mandated build order.** Phases 3–5 *are* that order, with the validation work (Phases 0–2) as the prerequisite that makes them worth doing.

---

## 4. Where we are today

A grounded snapshot from a full pass over the codebase.

### What exists and works

| Capability | State | Where |
|---|---|---|
| Bar-by-bar backtest engine | ✅ Solid | `backtest/engine.py` |
| VWAP-pullback-long strategy (rule-based) | ✅ | `strategy/vwap_pullback.py` |
| Indicators (VWAP, opening range) — **no lookahead** | ✅ Clean | `data/indicators.py` |
| Risk manager with absolute veto + position sizing | ✅ | `risk/{manager,sizing,state}.py` |
| Internal **paper broker** (fill simulation, stop/target, force-flat) | ✅ | `broker/{base,paper}.py` |
| Per-user config + knob editing; **knobs now actually drive the engine** | ✅ (just fixed) | `config.py`, frontend `strategy-config-dropdown.tsx` |
| **Per-run config snapshot** (reproducible, per-run display) | ✅ (just added) | migration `0092`, `lifecycle.py` |
| Run dedup (spec hash + data fingerprint) | ✅ | `run_spec.py`, migration `0091` |
| Cloud persistence (Supabase: runs/trades/signals/journal/bars/configs) + RLS | ✅ | `db/migrations/*`, `storage/client.py` |
| FastAPI service + React UI (runs list, detail, chart, replay, journal) | ✅ | `api/`, `frontend/src/` |
| Journal of executions **and** rejections (first-class) | ✅ | `journal/`, `signals` table |
| Direct DB access for migrations (psycopg + `SUPABASE_DB_URL`) | ✅ (just set up) | `backend/.env`, baked into image |
| **Multi-year SIP bar data** (164,918 bars, 2018→2026) + idempotent backfill + per-regime coverage | ✅ (Phase 0) | `data/alpaca_source.py`, `data/bar_source.py`, `scripts/backfill_bars.py`, `api/routers/bars.py` |

### What is deliberately NOT there (the gaps this roadmap fills)

| Missing | Impact | Phase |
|---|---|---|
| **Costs/slippage applied to fills** — `broker.fees_per_share`/`slippage_per_share` exist in config but are **never applied** | Every backtest PnL is overstated; intraday edge unproven | 1 |
| **Real metrics** — `summary.sharpe` is a placeholder `0.0`; no expectancy, no trade distribution, no per-regime breakdown | Can't judge edge quality or significance | 1 |
| ~~**Multi-year, multi-regime data**~~ — ✅ **DONE (Phase 0):** 164,918 Alpaca SIP bars 2018→2026, 4 regimes covered, `bars(bar_start)` index, in-app + CLI backfill | ~~Can't get a statistically meaningful sample~~ — now ~3,926 trades/full-span backtest | 0 ✅ |
| **Walk-forward / out-of-sample / lockbox split** | No way to distinguish edge from overfitting | 2 |
| **Significance / robustness tooling** (confidence intervals, parameter-plateau/sensitivity, permutation tests) | No defense against fitting noise | 2 |
| **Aggregation/insights API** (query across runs) | Can't analyze "this config over these periods" | 2 |
| **Alpaca integration** — *no* `alpaca` code anywhere; "paper" today means the in-process simulator only | No forward/paper/live execution path | 3 |
| **Live data feed, positions/orders/equity UI, monitoring, kill switch** | No operational surface for trading | 3–5 |
| **`docs/PAPER_TRADING.md` live-readiness gate** (constitution-required) | Live trading is constitutionally blocked until authored | 5 |
| Dead config knobs (`min_minutes_after_open`, `confirmation.*`) defined but unused | Misleading UI/config | 1 (cleanup) |

> **Dead-honest one-liner (updated 2026-06-03):** Phase 0 cleared the sample-size blocker — we now have ~8 years of consolidated multi-regime data and backtests producing thousands of trades. But we *still* have **no evidence of edge**: results are **zero-cost** (slippage/fees not yet applied — Phase 1) and **not out-of-sample** (Phase 2), and there's **no execution path to a broker** (Phase 3). A 3,926-trade backtest at +$3,793 means nothing until it's net-of-cost and validated. That's fine — it's exactly where the build order says we should be.

---

## 5. The phases

Each phase is a **gate**: you do not advance until its exit criteria are met. Effort estimates are rough and assume TDD throughout (constitution IV).

---

### Phase 0 — Data foundation

> **Status: ✅ DONE (2026-06-03)** — gate met. Backfilled **164,918 Alpaca SIP 5-min bars, 2018-01-02 → 2026-06-02**; all four regimes 100% covered; a full-span default backtest now produces **3,926 trades** (was ~6). Shipped on branch `009-data-foundation` (Spec Kit feature `009`).

**Goal:** enough clean, multi-regime SPY 5-min history that a single backtest produces **hundreds–thousands** of trades, not six.

**Why:** every number downstream is meaningless without sample size and regime coverage. This *was* the hard blocker — now cleared.

**Current state:** Source is **yfinance**, which only serves ~60 calendar days of intraday data (`data/downloader.py` chunks at `MAX_CHUNK_DAYS=60`; `lifecycle.py` materializes from the shared `bars` cache and auto-fetches missing recent days). Anything older than ~60 days can't be fetched and isn't cached. The `bars` table (`0007_bars.sql`) is keyed `UNIQUE(bar_start, source)` and has the `source` column ready for a second provider — but there's **no index on `bar_start` alone** and **no bulk-backfill tool**.

**Build:**
- [x] Add **Alpaca market-data** as a bar source (`data/alpaca_source.py`, behind a `BarSource` protocol; `source='alpaca'`). Using **SIP** (consolidated) via Algo Trader Plus → no IEX volume/VWAP-fidelity gap. `ALPACA_*` in `.env.example`.
- [x] **Bulk backfill** — in-app background job (`POST /api/bars/backfill`) + CLI (`scripts/backfill_bars.py`); idempotent upserts; one bar per timestamp on read (prefer Alpaca over yfinance).
- [x] `CREATE INDEX ON bars (bar_start)` (migration `0093`). Also **fixed a latent `list_bars` 1000-row PostgREST cap** that had been silently truncating multi-year reads.
- [x] Surface **data coverage** in the UI — `/api/bars/coverage` extended with per-regime % completeness (≥90% = "covered"); `DataCoveragePanel` + `?` tooltips.

**Exit gate:** ✅ **met** — 164,918 validated SIP bars across 4 regimes (all 100% covered), 2018→2026; full-span default backtest = **3,926 trades** in ~5s.

---

### Phase 1 — Make the backtest honest

> **Status: ✅ DONE (2026-06-03)** — gate met. Costs are applied to every fill (default **$0 fees + $0.01/share slippage**, adverse on entry and exit); a known fixture proves the exact deduction (3 trades × 44 sh × $0.01 × 2 = **$2.64**). Real metrics shipped — expectancy (R/$), daily-return **Sharpe/Sortino** (rf=0, ×√252), max drawdown in **$ and %**, return distribution (median/std/skew), an equity curve, and per-bucket breakdown (hour/weekday/month). Every result now shows **N + a Wilson 95% win-rate CI** and flags thin samples (<30) as noise. The three dead knobs are deleted. Shipped on branch `010-honest-backtest` (Spec Kit feature `010`).

**Goal:** the backtest measures *net, realistic* performance — so later tuning optimizes reality, not a fantasy.

**Why:** tuning on a zero-cost, thin-metric backtest optimizes the wrong target. Fix the ruler before measuring.

**Current state:** Fills are ideal. `broker/paper.py` computes `realized_pnl = (exit - entry) * qty` with **no** deduction; `BrokerConfig.fees_per_share`/`slippage_per_share` are parsed and ignored. `backtest/metrics.py` computes win rate, R stats, `total_pnl_dollars`, profit factor, max drawdown (in R) — but **no expectancy, no real Sharpe/Sortino, no trade distribution, no per-time/per-regime breakdown**. `RunSummary.sharpe` is a placeholder.

**Build:**
- [x] **Apply costs** in the paper broker: deduct `fees_per_share` + model `slippage_per_share` on entry and exit; non-zero defaults in `config.yaml` ($0 fees + $0.01/share slippage). Tests prove costs change PnL (TDD).
- [x] **Cost realism for intraday fills:** slippage baked adversely into next-bar-open fills; conservative same-bar stop-before-target preserved.
- [x] **Real metrics** in `metrics.py`: expectancy (R/$), equity curve, drawdown in $ and %, return distribution (median/std/skew), daily-return Sharpe/Sortino, and a **per-bucket breakdown** (hour-of-day, weekday, month-of-year, NY-local).
- [x] **Surface sample size + significance hints** on every result (N + Wilson 95% CI on win rate; <30 trades flagged as noise), each with a `?` tooltip.
- [x] **Cleanup:** deleted the dead knobs (`vwap_pullback.min_minutes_after_open`, `confirmation.require_close_above_*`) from the schema, `config.yaml`, and all presets — behavior-neutral (they were never read).

**Exit gate:** ✅ **met** — backtests report **net-of-cost** results with expectancy, drawdown ($/%), distribution, per-bucket breakdown, and an explicit trade-count + 95%-CI significance indicator. A committed fixture proves costs are applied to the cent ($2.64 on the golden 3-trade fixture).

---

### Phase 2 — Validation methodology

> **Status: 🛠️ ENGINE BUILT & TESTED (2026-06-03)** — feature `011-validation-engine` (branch, not yet merged). Backend + frontend complete and green (404 backend + 331 frontend tests); cloud migrations `0110`–`0112` applied. Train/validation/lockbox split, walk-forward, parameter-sensitivity surface, bootstrap + random-entry-permutation significance, and the one-shot lockbox gate are all implemented and launchable via `/api/validation/*` and the Validation UI. **The exit gate below is *operational*, not code** — it is met only by actually running studies and seeing whether a candidate config survives (or nothing does, which is a valid result). Remaining before the gate can be evaluated: a live end-to-end run on the cloud data + a perf pass.

> This is the heart of the whole thing — the engine that lets us refine knobs **without fooling ourselves**.

**Goal:** distinguish real edge from fit-to-noise, and tune knobs with out-of-sample discipline.

**Why:** in-sample optimization selects luck. The only antidote is testing on data you didn't tune on, and preferring robustness over peaks.

**Current state:** none. The backtester is single-pass; there's no split, no walk-forward, no significance, no cross-run aggregation.

**Build:**
- [ ] **Data split discipline:** tag/segment history into **train / validation / lockbox**. The lockbox is never looked at until the very end (one shot).
- [ ] **Walk-forward harness:** tune on a training window, validate on the *next* untouched window, roll forward. Report in-sample vs. out-of-sample side by side (a big gap = overfit).
- [ ] **Robustness over peaks:** parameter-sensitivity sweep + surface — a real edge is a **plateau** (works across a *range* of a knob's values). Prefer the boring middle of a plateau; distrust sharp spikes. Visualize the PnL/expectancy surface vs. each knob.
- [ ] **Significance:** bootstrap confidence intervals on key metrics; a permutation/Monte-Carlo test ("could random entries have done this?"). Report a clear "significant at α=0.05?" verdict.
- [ ] **Aggregation/insights API + views:** query outcomes across runs ("this config across these periods/regimes"). (This is the natural home for the soft-delete/retention idea — keeping run history is what makes walk-forward and cross-run analysis possible. See [Open decisions](#9-open-decisions).)
- [ ] **Lockbox test:** run the final *frozen* config on the held-out set exactly once. Holds → candidate for Phase 3. Disappoints → back to the drawing board (and that set is now burned).

**Exit gate:** a candidate config that (a) survives out-of-sample/walk-forward with a healthy trade count, (b) sits on a *plateau* not a spike, (c) is statistically significant after costs, and (d) passes a one-shot lockbox test. If nothing survives — **that's a valid, money-saving result.**

---

### Phase 3 — Forward paper trading

**Goal:** prove the edge on data that *didn't exist when we built it*, and exercise the real execution machinery — first with the internal simulator on live data, then on **Alpaca paper**.

**Why:** the truest test is forward, out-of-sample-by-construction. It also shakes out the *operational* bugs (fills, reconnects, partial orders) that actually blow up automated systems. This is the next two steps of the constitution's build order: `internal paper broker → Alpaca paper`.

**Current state:** "paper" today is only the in-process backtest simulator — no live clock, no live data, no Alpaca, no positions/orders/equity UI, no monitoring, no kill switch.

**Build:**
- [ ] **Broker abstraction:** extract a broker interface; keep `PaperBroker` (sim) and add `AlpacaPaperBroker` (Alpaca paper REST). Strategy → risk veto → broker stays the same shape.
- [ ] **Live bar feed:** real-time / 5-min bars (Alpaca websocket or polling), feeding the same indicator pipeline.
- [ ] **Session runner:** a long-running loop (idle → trading → flat at close) honoring the clock (`no_new_trades_after`, `force_flat_time`) and the risk veto, journaling everything (constitution VII).
- [ ] **Operator surface (constitution VI tooltips):** positions table, open/filled orders, intraday **equity curve**, live P&L, risk meter (% at risk, daily-loss headroom), and a prominent **kill switch** (force-flat + halt).
- [ ] **Backtest-vs-paper comparison:** track live paper results against backtest expectation continuously — **divergence = overfit**.

**Exit gate:** months of forward paper trading where live paper results are *consistent with* backtest expectations (within reason), the operational system handles outages/partial fills/reconnects cleanly, and the kill switch is tested.

---

### Phase 4 — Manual-approval mode

**Goal:** the system proposes trades; a human approves each (or each session) before anything is submitted. Bridge between paper and autonomous.

**Why:** constitution build order step 4. Keeps a human in the loop while we build trust and audit history.

**Build:**
- [ ] Approval queue: proposed orders held pending explicit sign-off; audit every approval (who/when) — journaled.
- [ ] UI to review + approve/reject proposed trades.
- [ ] Reconciliation: our intended state vs. broker's actual state, surfaced and alertable.

**Exit gate:** a sustained period where approved trades match intentions, reconciliation is clean, and the audit trail is complete.

---

### Phase 5 — Tiny live

**Goal:** real money, **severely constrained**, only after the constitutional gate is satisfied.

**Why:** this is the final, gated step ("much later, maybe"). The point is to validate the *plumbing and psychology* at trivial risk, not to make money yet.

**Hard prerequisites (constitution V):**
- [ ] **Author `docs/PAPER_TRADING.md`** — the live-readiness checklist the constitution requires (currently missing). This is a blocking gate.
- [ ] Add a second runtime flag `manual_readiness_approved` (default false); guard every live-order path with **both** it and `live_auto_enabled`; add a test that the live path is unreachable by default.
- [ ] Constitution amendment formalizing live-trading constraints.

**Constraints when it does turn on:**
- [ ] Predefined **kill criteria** *before* going live (max drawdown %, live-vs-expected divergence threshold → auto-halt).
- [ ] Tiny size (e.g., 1 share / fixed small $), daily trade + loss caps, time-of-day limits.
- [ ] Always-visible kill switch; monitoring/alerting on errors and drawdown.
- [ ] Scale **only** as live confirms paper — slowly.

**Exit gate:** there isn't one — this is steady-state operation under continuous monitoring, with the standing discipline to **turn it off** when live stops matching expectations, and to **not re-tune on every losing week** (that's just emotional curve-fitting with extra steps).

---

## 6. Cross-cutting concerns

**Risk management (matters more than entry tuning).** Fixed-fractional sizing, a hard **daily-loss circuit breaker**, a **max-drawdown kill switch**, respect for risk-of-ruin. The risk manager's absolute veto (constitution III) is the right foundation — extend it, don't bypass it.

**Operational robustness (where automated systems actually fail).** Idempotent orders (never double-fire), handle rejects/partial fills/outages, reconcile our state vs. the broker's, a manual kill switch, monitoring + alerts, and exhaustive journaling (constitution VII).

**Governance gates.** Live is blocked at three layers by design; the `docs/PAPER_TRADING.md` review is mandatory; any move toward *automated* parameter optimization (vs. manual OOS research) needs a constitution check against Principle II.

**Multi-symbol expansion (future scope).** We will add symbols beyond SPY over time. This is a cross-cutting change, sequenced *after* a single-symbol edge is validated (Phases 0–2) — and it starts with a **constitution amendment** (Principle I). Concretely, it touches:
- **Data/schema:** the `bars` table has **no `symbol` column** today (`UNIQUE(bar_start, source)` assumes SPY). Multi-symbol needs `symbol` added, the unique key changed to `(symbol, bar_start, source)`, an index, and per-symbol backfill.
- **Hard-coded SPY boundaries:** `MarketConfig.symbol = Literal["SPY"]` (`config.py`), the `strategies` table `CHECK (symbol='SPY')`, the risk manager's non-SPY rejection, the API's rejection of a `symbol` field, and SPY-locked data loaders — all must become symbol-parameterized.
- **Strategy math ports; edges don't.** VWAP/opening-range logic is symbol-agnostic, but a config tuned on SPY does **not** transfer to QQQ/AAPL — **each symbol is re-validated from scratch** (its own data, regimes, out-of-sample, costs). Symbols multiply the validation surface.
- **Portfolio risk:** multiple concurrent symbols introduce *aggregate* exposure and correlation risk that the current per-symbol risk manager doesn't model (e.g., SPY + QQQ are ~the same bet). New portfolio-level limits will be needed.
- **Design-for-it now, build-it-later:** as we build Phases 0–3, prefer symbol-parameterized signatures over new hard-coded SPY, so the eventual switch is additive rather than a rewrite — but don't *enable* other symbols until the amendment + per-symbol validation are done.

**Educational UI (constitution VI).** Every new concept introduced by this roadmap — slippage, expectancy, walk-forward, out-of-sample, equity curve, drawdown, circuit breaker, kill switch — ships with a HelpTooltip.

---

## 7. Anti-overfitting checklist

Run this against any config before it earns more trust:

- [ ] **Net of realistic costs** (not zero).
- [ ] **Enough trades** to matter (hundreds+, with a stated confidence interval).
- [ ] **Out-of-sample**: validated on data not used to tune it.
- [ ] **Plateau, not peak**: performance is stable across a *range* of each knob; nudging a knob 10% doesn't tank it.
- [ ] **Multi-regime**: works (or fails gracefully) across bull/bear/chop, not just one period.
- [ ] **Significant**: beats a permutation/random-entry baseline.
- [ ] **Lockbox-clean**: survived the one-shot held-out test.
- [ ] **Forward-confirmed**: paper-forward results match backtest expectations.
- [ ] **Simple**: fewer knobs / fewer special cases is more robust. Distrust complexity that only helps in-sample.

If it fails any of these, it has not earned real money.

---

## 8. Metrics glossary

What we should track (and why) once Phase 1 lands:

| Metric | What it tells us | Notes |
|---|---|---|
| **Expectancy / trade** | Avg $ (or R) you make per trade | The core "is there an edge" number |
| **Win rate** | % of trades that win | Meaningless without sample size + avg win/loss |
| **Avg win / avg loss (R)** | Payoff asymmetry | High win rate can still lose if losses are big |
| **Profit factor** | Gross win ÷ gross loss | >1 = net positive; want a margin above 1 after costs |
| **Max drawdown ($ and %)** | Worst peak-to-trough | Drives position sizing + psychological survivability |
| **Sharpe / Sortino** | Risk-adjusted return | Currently a placeholder — implement properly in Phase 1 |
| **Trade distribution** | Median, spread, skew of outcomes | Reveals reliance on a few lucky trades |
| **Per-bucket performance** | Edge by hour/weekday/regime | Where the edge actually lives — or breaks |
| **In-sample vs. OOS gap** | Overfitting detector | Large gap = fit to noise |
| **Confidence interval** | Is the result distinguishable from luck? | Bootstrap; widens with small N |

---

## 9. Open decisions

- **Data source:** adopt **Alpaca** for historical bars (Phase 0) to get multi-year intraday history and align with the execution broker; keep yfinance as a fallback. *(Recommended.)*
- **Soft delete / retention:** keep run history (rather than hard delete) so walk-forward and cross-run insights have data — but distinguish *junk* runs from *kept* experiments so trend analysis isn't polluted. Best decided as part of the Phase 2 insights work, not before. *(Leaning yes, scoped to insights.)*
- **Optimization stance:** parameter *research* stays **manual + out-of-sample-disciplined** (within constitution II). Any future automated optimizer is a separate, governance-reviewed decision.
- **"Mostly automated" boundary:** automate entries/exits/sizing/stops; keep a human on on/off, monitoring, and the keep-trading-it decision.
- **Multi-symbol expansion:** confirmed future direction (SPY first). Requires a constitution amendment (Principle I) + per-symbol re-validation + a `bars.symbol` schema change + portfolio-level risk. Sequence it *after* Phases 0–2 prove a single-symbol edge; design Phases 0–3 to be symbol-parameterized so the switch is additive. *(See [§6](#6-cross-cutting-concerns).)*

---

## 10. Execution via Spec Kit

The build phases ship as discrete **Spec Kit features — one per phase** — each run through the full pipeline (`specify → clarify → plan → tasks → analyze → implement`) with a Constitution Check and TDD (Principle IV). We write each spec **just-in-time**: only once the prior phase's exit gate is met, so we never front-load planning for work a gate might cancel ("prove it wrong cheaply").

**Why one feature per phase (not one combined spec):** each phase is a gate with its own exit criteria, hard dependencies (Phase 1 needs Phase 0's data; Phase 2 needs Phase 1's honest metrics), and its own Constitution-Check surface. A combined mega-spec would be unreviewable and would front-load abandonable planning.

### Feature ↔ phase map

Feature numbers are proposed; status updated as work lands.

| Feature | Phase | Scope | Status |
|---|---|---|---|
| `008-soft-delete-insights-engine` | retention prereq | **Trim to soft-delete only** (`deleted_at`, list filters, migration `0100`). Its *insights-engine* half moves to Phase 2 — insights built on today's zero-cost / 60-day-sample archive would be confidently wrong. | Planned (`plan.md` exists) |
| `009` | **Phase 0 — data foundation** | Alpaca historical source + bulk backfill + `bars(bar_start)` index + coverage surfacing | **✅ Done & exit gate met** (branch `009-data-foundation`). Backfilled **164,918 SIP 5-min bars, 2018-01-02 → 2026-06-02**; all four regimes 100% covered; a full-span default backtest yields **3,926 trades** in ~5s. Used Alpaca **SIP** (consolidated) so no IEX/VWAP-fidelity gap. Fixed a latent `list_bars` 1000-row PostgREST cap that had been silently truncating multi-year reads. |
| `010` | **Phase 1 — honest backtest** | Apply costs/slippage + real metrics (expectancy, Sharpe, drawdown $/%, distribution, per-bucket) + dead-knob cleanup | **✅ Done & exit gate met** (branch `010-honest-backtest`). Net-of-cost fills ($0 fees + $0.01/sh slippage, fixture proves $2.64); expectancy, daily-return Sharpe/Sortino, drawdown $/%, distribution, equity curve, per-bucket (hour/weekday/month); N + Wilson 95% CI + noise flag; 3 dead knobs deleted. TDD throughout; educational tooltips for every new concept. |
| `011` | **Phase 2 — validation** | train/validation/lockbox split, walk-forward, robustness/sensitivity surface, bootstrap + random-entry-permutation significance, one-shot lockbox gate | **🛠️ Engine built & tested** (branch `011-validation-engine`, not merged). Backend + frontend complete; 404 backend + 331 frontend tests green; cloud migrations `0110`–`0112` applied. Decided the **011/012 split** (this is the validation engine; insights/aggregation + `008` soft-delete deferred to `012`) and kept it **evaluate-and-report only** (Principle II — no auto-optimizer; a guard test asserts no validation path reaches live trading). FR-005 child-run drill-down deferred. Exit gate is operational: pending a live e2e run + perf pass. |
| `012` | **Phase 2 — insights** | cross-run insights/aggregation API + views (per-config distribution, sensitivity across the archive, edge time-series, rejection mining) + the `008` soft-delete retention prereq | Not started (deferred from `011`) |
| later | **Phases 3–5 — paper → live** | Alpaca paper → manual approval → tiny live. Specced when reached; gated by Principle V (author `docs/PAPER_TRADING.md`, the 3-layer live block, a constitution amendment). | Gated |

### Sequencing rules
- **Close out or consciously defer `007`** (active: 120/135, deferred tests) before opening `009` — don't juggle two open features.
- **One spec in flight at a time;** write the next only after the current phase's **exit gate** is met (see each phase in [§5](#5-the-phases)).
- **Phase 2 may split** into a validation-engine feature + an insights/aggregation feature — decide at *its* spec time, not now.
- **Each plan's Constitution Check must explicitly address:** Phase 0 → new data source + the multi-symbol setup (Principle I); Phase 2 → keep parameter research **manual / non-ML** (Principle II); every feature → TDD (IV), journaling (VII), and `?`-tooltips for any new concept (VI).

---

### TL;DR

We have a clean backtest viewer and **no proven edge or execution path** — which is exactly where the constitution's build order says we should be. The work, in order: **get real data (0) → measure honestly (1) → validate without self-deception (2) → forward-paper on Alpaca (3) → manual approval (4) → tiny gated live (5).** The discipline that makes it worth doing — costs, sample size, out-of-sample, plateaus, forward confirmation — is the entire point. If the strategy survives all of it, automating it removes emotion from something *worth* executing. If it doesn't, the process just saved us real money.
`