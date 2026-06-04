# Research-Tooling Uplift — making the validation engine usable

> A planning doc that frames what this app is *two of*, why that creates friction
> today, and decomposes the fix into discrete Spec Kit features. Each feature
> below has a **"Spec Kit seed"** you can paste straight into `/speckit-specify`.

**Status:** proposal · **Audience:** us (builder/operator) · **Last grounded against code:** 2026-06-04 · **Prereq:** Feature `011-validation-engine` (validation engine — done)

---

## 1. What this app is two of

**Job 1 — Backtesting & learning tool.**
Build and tune *one* SPY intraday strategy config, run a single backtest, and
*understand* it: every trade, every rejected signal, the journal, the equity
curve, the chart — with educational tooltips on every concept. The atom is **one
run of one config**. The job is *learn how the strategy behaves and iterate on a
config.* (Features 001–010.)

**Job 2 — Validation & research engine.**
Decide whether a config has a *real, durable edge* by running **many** backtests
and judging them statistically: walk-forward (out-of-sample), sensitivity (knob
robustness), significance (vs. luck), lockbox (one honest final test). The atom
is **a study over many configs and windows**. The job is *prove an edge wrong
cheaply, then compare and select.* (Feature 011.)

These are not two products — they're one research workflow (`config → backtest →
validate → (later) paper → live`). They share the engine, the 165k-bar dataset,
the risk manager, the config schema, persistence, and auth.

## 2. Why this is a problem today

The two jobs share a core, but they need **different primitives** — and the app
was built entirely for Job 1. So Job 2 keeps hitting walls. Three mismatches:

1. **Config is singular and mutable.** The app treats config as one editable
   object (`default`, seeded at signup). But Job 2's whole purpose is to
   **compare** many *named, frozen* configs. The `configs` table already supports
   multiple named configs (`UNIQUE(user_id, name)`, plus `upsert_config` /
   `list_configs` / `get_config_by_name` / `update_config` in `storage/client.py`),
   but there is **no way to create, duplicate, rename, or delete** a config — so
   in practice only `default` exists. Result: the validation config picker is
   empty, you edit one config in place, you can't A/B anything, and knob changes
   get lost in confusion.

2. **The atom mismatch (run vs. study).** Job 1's unit is a saved, drillable
   *run*. Job 2's *studies* (011) orchestrate many runs but **persist only the
   aggregated result** — the per-window evaluations run in-memory and their
   `run_id`s are ephemeral (the deliberate FR-005 deferral). The `runs` table
   already has `study_id` / `segment` / `window_index` columns (migrations
   0110/0111) but nothing writes them. Result: significance can't attach to a
   study window (it 404s — the run isn't persisted), and you can't drill into a
   window's trades/journal/chart.

3. **No clear lanes.** Educational single-run viewing and rigorous multi-run
   research live in one undivided UI, so it's never obvious where each job
   happens — e.g. significance landed on the *run* page, configs on the
   *validation* page.

**Diagnosis:** it's not two apps clashing — it's **one app whose core primitives
(config, run) are too primitive for the research the validation layer now
demands.** The fix is to evolve those primitives in place, not to fork.

> **Where a real split would eventually go** (not now): the only natural fault
> line is **research (backtest + validation) vs. live operations (paper → manual
> → tiny-live, roadmap Phases 3–5)**, because live trading is real-time,
> monitored, money-at-risk. Backtest and validation stay *together* on the
> research side. We're nowhere near needing that split.

## 3. The uplift — principles

- **One app.** Evolve shared primitives; do not duplicate the engine/data/config.
- **Config becomes first-class** — the single highest-leverage change.
- **Studies persist their children** — close the run/study seam.
- **Clarity via internal lanes,** not separate apps.

## 4. Feature decomposition (proposed)

Feature numbers continue the roadmap's sequence; the previously-pencilled "012
insights/aggregation" shifts to **014**. Adjust numbers at spec time.

| Feature | Scope | Why now | Depends on |
|---|---|---|---|
| **012 — First-class configs** | create / duplicate / rename / delete named configs; presets as starting points; config-management UI; ship a SPY-workable default | The unlock: without it Job 2 has nothing to compare; also fixes the 0-trade `position_size_cap` confusion | 011 |
| **013 — Study child-run persistence + drill-down** | orchestrator writes each window/grid eval as a real (study-tagged) run; study-detail rows link to run-detail; significance attaches to a window; runs list hides study children | Closes the run/study seam; makes significance + drill-down work end-to-end | 011, complements 012 |
| **014 — Insights / aggregation + retention** | cross-run insights API + views (per-config distribution, sensitivity across the archive, edge time-series, rejection mining) + soft-delete (the trimmed `008`) | Far more valuable once 013 produces many child runs to aggregate | 013 |
| **015 (optional) — Research/Learn UI lanes** | reorganize nav/IA into "Backtest / Learn" and "Validate / Research" sections over the shared core | Clarity; can be folded into 012/013 | 012, 013 |

**Immediate, no-feature fix (do now):** the shipped `default` config is mis-sized
for SPY at ~$740 on a $25k account — `risk.max_position_value_pct = 100` makes
the risk-based size exceed the value cap, so `position_size_cap` rejects nearly
every signal → 0 trades. Raising `max_position_value_pct` (e.g. 400–1000) and/or
lowering account expectations makes backtests execute. Folds naturally into 012's
"ship a workable default + presets."

---

## 5. Spec Kit seeds

Paste a block into `/speckit-specify` to start that feature. Each is
self-contained; the pipeline (specify → clarify → plan → tasks → analyze →
implement) and Constitution Check apply as usual.

### Seed — Feature 012: First-class config management

```
012-config-management — turn "config" from a single mutable `default` into a
first-class, named, comparable object, so the validation engine (011) can
actually compare configs and the operator can do real parameter research.

GOAL: An operator can create, duplicate, rename, edit, and delete multiple named
strategy configs and pick among them when launching backtests, validation
studies, and the lockbox. This is the unlock for Job 2 (validation/research):
walk-forward over config A vs B, sensitivity over a chosen base config, and
freezing a named candidate for the lockbox all require more than one config to
exist.

CURRENT STATE: the `configs` table is keyed UNIQUE(user_id, name) and the storage
layer already has upsert_config / list_configs / get_config_by_name /
get_config_by_id / update_config. Per-run immutability already exists
(runs.config_snapshot, migration 0092). But the app only ever uses one config
named `default` (seeded at signup, migrations 0070/0080). There is NO endpoint or
UI to create a new named config, duplicate one, rename, or delete one — so
listConfigs returns just `default`, the validation config picker is empty, and
you can only edit `default` in place. Presets exist as files
(backend/config/presets/{aggressive,demo,low-risk,vwap50}.yaml) but aren't
exposed as user configs.

REQUIRED CAPABILITIES:
1. Create a new named config — from scratch, from a built-in preset, or by
   duplicating an existing config. Names are unique per user.
2. Duplicate an existing config under a new name (copy its params).
3. Rename and delete configs. Deleting must NOT corrupt run history: runs carry
   their own config_snapshot, but runs.config_id FK-references configs(id) —
   decide and implement the safe behavior (e.g. ON DELETE SET NULL / RESTRICT /
   soft-delete configs) so deleting a config used by past runs is safe.
4. Edit a named config's knobs (the existing edit, now per-config).
5. Config-management UI: list configs, create/duplicate/rename/delete, edit
   knobs; the existing single-config editor becomes a multi-config manager.
6. Every "pick a config" surface (start-backtest, start-study, lockbox) selects a
   config by name from the real list.
7. Ship a SPY-WORKABLE default + presets: the current default's
   risk.max_position_value_pct=100 makes position-size sizing exceed the value
   cap at SPY ~$740 on a $25k account, so position_size_cap rejects nearly every
   signal (0 trades). Provide defaults/presets that actually execute trades.

CONSTITUTION TOUCHPOINTS: I (SPY-only, unchanged); II (configs are rule-based
knobs only, no ML); III (risk manager still enforces every config's risk knobs;
configs cannot weaken the veto contract); IV (TDD); V (configs cannot enable live
— live_auto_enabled stays pinned False at all layers); VI (tooltips for config
concepts); VII (config create/duplicate/delete journaled).

OUT OF SCOPE: sharing configs across users; config import/export; automated
parameter optimization (Principle II).
```

### Seed — Feature 013: Study child-run persistence + drill-down

```
013-study-run-persistence — persist each validation study's per-window /
per-grid-point evaluation as a real, drillable run, closing the run/study seam so
significance attaches to study windows and any window's trades/journal/chart can
be inspected.

GOAL: Studies (011) currently persist only the aggregated result; the per-window
evaluations run in-memory (engine.run_df) and their run_ids are ephemeral (the
FR-005 deferral). The runs table already has study_id / segment / window_index
columns (migrations 0110/0111) but nothing writes them. This feature makes each
evaluation a first-class persisted run so the validation flow is self-contained.

REQUIRED CAPABILITIES:
1. The study orchestrator (validation/study.py) persists each window/grid
   evaluation as a child run tagged study_id/segment/window_index, via the
   existing push path (insert_queued_run + push_run_finalize, or push_run),
   reusing run dedup (compute_spec_hash + data_fingerprint) so identical
   evaluations across studies are linked, not recomputed (SC-008 from 011).
2. The lockbox one-shot run also persists its child run (currently ledger.run_id
   is null) so the lockbox result is drillable.
3. Study-detail UI: each walk-forward window row and each sensitivity grid cell
   links to that child run's detail page.
4. Significance attaches to a study window: the significance panel is reachable
   from a window (pointing at the window's real run_id), not only the standalone
   run-detail page.
5. The main runs list HIDES study children by default (study_id IS NOT NULL) so
   it isn't flooded; they're reached via their study. (Connects to the
   soft-delete/retention work — see 014.)

CONSTRAINTS: a study can spawn tens to hundreds of child runs — mind write load
(consider batching the push) and runs-list pollution (filter study children).
Behavior of every evaluation must stay byte-identical to today's in-memory run
(it's the same engine.run_df; persistence is additive).

CONSTITUTION TOUCHPOINTS: I/II/III/V unchanged; IV (TDD — persistence + the
runs-list filter + dedup-reuse have failing tests first); VI (drill-down + the
per-window significance affordance get tooltips); VII (child runs + lockbox run
journaled as today).

OUT OF SCOPE: the cross-run insights/aggregation API (that's 014).
```

### Seed — Feature 014: Insights / aggregation + retention

```
014-insights-aggregation — cross-run insights and the soft-delete retention
prerequisite (the trimmed 008). Query outcomes ACROSS runs and studies:
per-config performance distribution, parameter sensitivity across the whole
archive, time-series of a config's edge, cross-config comparison, and rejection
mining. Includes soft-delete (deleted_at) so the archive that powers these
insights is preserved while the sidebar still hides "deleted" runs.

(Spec in full when reached — this was the previously-pencilled "012" in the
roadmap; it is far more valuable AFTER 013 persists study child runs, giving it a
rich archive to aggregate.)
```

### Seed — Feature 015 (optional): Research/Learn UI lanes

```
015-ui-lanes — reorganize the app's information architecture into two clear lanes
over the shared core: a "Backtest / Learn" surface (single-run viewing, chart,
journal, education) and a "Validate / Research" surface (studies, configs,
significance, lockbox). Same engine/data/persistence; navigation + grouping only.
May be folded into 012/013 rather than shipped standalone.
```

---

## 6. Sequencing & roadmap fit

This uplift slots **between Phase 2 (validation, done) and Phase 3 (forward
paper)** — it's what makes Phase 2 actually usable for research before we invest
in live execution. Order: **012 (configs) → 013 (study runs) → 014 (insights) →
[015 lanes]**. The roadmap's existing "012 insights/aggregation" entry becomes
014; update `docs/automated-trading-roadmap.md` §10 feature map accordingly.

Sequencing rule (unchanged from the roadmap): one spec in flight at a time; write
the next only after the prior feature's gate is met.

## 7. TL;DR

We don't have two clashing apps — we have **one app whose config and run
primitives are too primitive for the research layer we just built**. Make configs
first-class (012), persist study children (013), then aggregate across the
archive (014). Don't fork; evolve the core. The only real future split is
research vs. live-operations, and that's Phases 3–5, not now.
