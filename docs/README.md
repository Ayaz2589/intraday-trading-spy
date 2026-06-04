# Docs index

Cross-cutting design, roadmap, and policy docs. Per-feature specs live under
[`specs/`](../specs); governance lives in `.specify/memory/constitution.md`.

## Roadmap & planning

- [automated-trading-roadmap.md](automated-trading-roadmap.md) — the phase plan
  (Phase 0 data → 1 honest backtest → 2 validation → 3–5 paper→live) and the
  feature map with current status.
- [research-tooling-uplift.md](research-tooling-uplift.md) — the "two jobs"
  framing (backtest/learn vs validate/research) and the 012→015 decomposition.
  Feature 012 (first-class configs) shipped from this; 013 (study child-runs)
  and 014 (insights) are next.

## Cross-feature design

- [migrations/2026-05-30-supabase-vercel-migration.md](migrations/2026-05-30-supabase-vercel-migration.md)
  — the Supabase + Vercel cloud migration (features 005–008).
- [deploy/](deploy) — deployment notes (Fly.io backend, Vercel frontend).

## Policy

- [retention-policy.md](retention-policy.md) — data-retention policy (declared;
  enforcement is a future feature / pg_cron job).

## Research log

- [../EXPERIMENTS.md](../EXPERIMENTS.md) — running log of deliberate backtest +
  walk-forward experiments (hypothesis → knobs → outcome → lesson).
