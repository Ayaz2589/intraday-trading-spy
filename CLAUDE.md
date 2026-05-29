<!-- SPECKIT START -->
# CLAUDE.md — intraday-trade-spy

**Active plan**: [specs/003-backtest-viewer-ui/plan.md](specs/003-backtest-viewer-ui/plan.md)

**Active spec**: [specs/003-backtest-viewer-ui/spec.md](specs/003-backtest-viewer-ui/spec.md)

**Prior plans**:
- [specs/001-backtest-mvp-spy-vwap-pullback/plan.md](specs/001-backtest-mvp-spy-vwap-pullback/plan.md) — implemented
- [specs/002-historical-spy-yfinance-loader/plan.md](specs/002-historical-spy-yfinance-loader/plan.md) — implemented

Source of truth for governance: `.specify/memory/constitution.md` (v1.1.0).
Read it, the active plan, and the active spec before planning, reviewing,
or implementing any change.

**Research notebook**: every deliberate backtest experiment goes in
[`EXPERIMENTS.md`](./EXPERIMENTS.md) via the `/experiment` skill
(`.claude/skills/experiment/SKILL.md`). The skill diffs the configs +
summaries of two runs and appends a new entry with hypothesis +
lesson — durable record of "I changed X, here's what happened."

## What this project is

A standalone, SPY-only intraday trading research, paper-trading, and
learning application. Not a migration of the daily regime trader. The
goal is an educational system that explains itself while enforcing safe
engineering defaults.

## Hard constraints (mirror of the constitution)

1. **SPY only.** No other instruments in v1.
2. **Long-only, rule-based v1.** No shorting, no HMM, no ML.
3. **Risk manager has absolute veto.** Every trade has a stop-loss AND a
   take-profit. No stop-loss = no trade.
4. **TDD is mandatory for every change to production code** in
   `backend/src/`, `frontend/src/`, and non-trivial `backend/scripts/`.
   Tests first; then implementation. Exempt: config, docs, READMEs,
   `.gitignore`, ≤5-line wrappers, type stubs, generated code.
5. **Paper-first.** `mode: backtest` or `mode: paper` only. Live
   auto-trading is disabled by default and gated behind a documented
   readiness review.
6. **Educational UI.** Every UI concept ships with a `?` `HelpTooltip`
   answering: What is this? Why does it matter? How is the app using it?
7. **Journal everything.** Executions, rejections, skipped setups,
   force-flat exits — all logged with full context.

## Architecture rule

```
Strategy suggests → Risk manager approves/rejects → Broker executes only approved trades → Journal logs everything.
```

Strategy modules MUST NOT size positions or place orders. The broker
MUST refuse any order whose `RiskDecision` is not `approved`.

## Engineering standards

- Timezone: `America/New_York`. `clock.py` is the single source of truth.
- Regular session only (09:30–16:00 ET). Default timeframe: 5-minute bars.
- All limits, thresholds, and session times live in
  `backend/config/config.yaml`. No hardcoded magic numbers.
- Backend: Python ≥3.11, FastAPI, Pydantic v2, pytest.
- Frontend: React + TypeScript + Vite + Tailwind.
- Small, focused files. One clear responsibility per file.

## Do NOT build (v1)

- Multi-symbol / QQQ / options / futures / crypto
- Short selling
- HMM regime detection
- ML / sentiment / news / social scanners
- Live auto-trading

## Spec Kit workflow

Every feature flows through:

```
speckit-specify → speckit-clarify (if needed) → speckit-plan → speckit-tasks → speckit-analyze → speckit-implement
```

Plans MUST include a Constitution Check section citing which of the seven
principles the feature touches and proving non-violation. Tensions belong
in Complexity Tracking with a justification.

## First implementation target (Feature 001)

Backtest MVP: monorepo skeleton, config loader, domain models, VWAP +
opening range indicators, VWAP-pullback long strategy, risk manager,
CLI backtester. No React UI yet — that becomes a later feature.
<!-- SPECKIT END -->
