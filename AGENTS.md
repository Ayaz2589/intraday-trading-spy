<!-- SPECKIT START -->
# AGENTS.md — intraday-trade-spy

**Active plan**: [specs/018-recommendation-engine/plan.md](specs/018-recommendation-engine/plan.md) — recommendation engine closing the 016/017 loop: deterministic per-config OOS health verdicts (ok/degrading/failing/insufficient-evidence, thresholds in config.yaml), evidence packs mined from persisted 011/014/016 artifacts (no new backtests), ranked whitelisted knob-delta candidates + gather-evidence/stop-tuning classes, Codex scope='recommend' on the existing analyst, 017 Draft-config actuation, and a deletion-surviving trial ledger (migration 0125). New backend package `recommend/`; zero new deps; deterministic core works with Codex off.

**Most recent spec**: [specs/018-recommendation-engine/spec.md](specs/018-recommendation-engine/spec.md)

**Cross-feature design** (features 005-008): [docs/migrations/2026-05-30-supabase-vercel-migration.md](docs/migrations/2026-05-30-supabase-vercel-migration.md)

**Prior plans**:
- [specs/001-backtest-mvp-spy-vwap-pullback/plan.md](specs/001-backtest-mvp-spy-vwap-pullback/plan.md) — implemented
- [specs/002-historical-spy-yfinance-loader/plan.md](specs/002-historical-spy-yfinance-loader/plan.md) — implemented
- [specs/003-backtest-viewer-ui/plan.md](specs/003-backtest-viewer-ui/plan.md) — implemented
- [specs/004-design-system-adoption/plan.md](specs/004-design-system-adoption/plan.md) — implemented
- [specs/005-supabase-data-layer/plan.md](specs/005-supabase-data-layer/plan.md) — implemented (MVP scope shipped; US2/US3/Polish deferred)
- [specs/006-fastapi-service-expansion/plan.md](specs/006-fastapi-service-expansion/plan.md) — implemented end-to-end against live Supabase (8 integration test tasks deferred)
- [specs/007-frontend-auth-api-migration/plan.md](specs/007-frontend-auth-api-migration/plan.md) — 120/135 tasks complete; per-component unit tests + integration tests + data-source picker deferred (see test-inventory.md)
- [specs/009-data-foundation/plan.md](specs/009-data-foundation/plan.md) — implemented (Phase 0; 164,918 SIP bars 2018→2026, exit gate met)
- [specs/010-honest-backtest/plan.md](specs/010-honest-backtest/plan.md) — implemented (Phase 1; net-of-cost fills + real edge metrics, exit gate met)
- [specs/011-validation-engine/plan.md](specs/011-validation-engine/plan.md) — implemented & merged to main (Phase 2; walk-forward/sensitivity/significance/lockbox, backend+UI, e2e-verified; exit gate is operational). See [docs/research-tooling-uplift.md](docs/research-tooling-uplift.md) for the 012/013/014 follow-on.
- [specs/012-config-management/plan.md](specs/012-config-management/plan.md) — implemented & merged to main (Phase 2 follow-on; first-class named configs create/duplicate/rename/delete/activate + SPY-workable default cap=400 fixing the 0-trade wall; backend+UI; edit-isolation/journaling/e2e verified live on cloud).
- [specs/013-data-observability/plan.md](specs/013-data-observability/plan.md) — implemented & merged to main (Data-page uplift: backfill job history w/ persistent failure reasons, cache summary + no-missing verdict, year×month completeness heatmap w/ exact missing-day hover, light lineage; no DB migration — R8 psycopg aggregate; verified live: 168k bars, 0 missing sessions).
- [specs/014-study-run-persistence/plan.md](specs/014-study-run-persistence/plan.md) — implemented & merged to main (study child-run persistence + drill-down: every study eval persisted as a spec_hash-deduped, fail-soft child run; lockbox child + ledger link; runs list hides children; Re-run study; redesigned study detail page w/ expandable IS/OOS rows; zero migrations; also fixed the latent API summary-write crash that emptied the runs table since 010; e2e-verified live).
- [specs/015-monte-carlo/plan.md](specs/015-monte-carlo/plan.md) — implemented & merged to main (Monte Carlo path-risk on any run: seeded shuffle drawdown/streak/underwater distributions vs observed, bootstrap forward cone + terminal percentiles, risk-of-ruin per threshold; run-detail panel w/ caveat-unless-provably-OOS banner + thin-sample badge; POST /api/validation/monte-carlo on-demand/deterministic/no persistence; zero migrations, zero new deps; e2e-verified live).
- [specs/016-insights/plan.md](specs/016-insights/plan.md) — implemented & merged to main via PRs #3/#4 (pooled study gate productized — wf-rr3 verdict persisted NOT PASSED, canonical CI [−0.71,+2.60]; Insights page w/ R-default edge time-series + regime overlay + per-config distribution + gate chips; advisory Codex narrative — cited findings, snapshot-pinned idempotency, billing auto-pause; migration 0123, dep `anthropic`; live-verified incl. real Opus analysis).
- [specs/017-Codex-experiment-drafts/plan.md](specs/017-Codex-experiment-drafts/plan.md) — implemented & merged to main via PR #6 (clickable Codex experiments → draft configs: knob registry w/ whitelist sanitation before storage, URL-carried transient drafts, human-gated create w/ durable provenance via configs.description; migration 0124).

Source of truth for governance: `.specify/memory/constitution.md` (v1.1.0).
Read it, the active plan, and the active spec before planning, reviewing,
or implementing any change.

**Research notebook**: every deliberate backtest experiment goes in
[`EXPERIMENTS.md`](./EXPERIMENTS.md) via the `/experiment` skill
(`.Codex/skills/experiment/SKILL.md`). The skill diffs the configs +
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
