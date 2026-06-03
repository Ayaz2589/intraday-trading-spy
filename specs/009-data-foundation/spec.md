# Feature Specification: Phase 0 — Data Foundation (Multi-Regime Historical Bars)

**Feature Branch**: `009-data-foundation`

**Created**: 2026-06-02

**Status**: Draft

**Input**: User description: "Phase 0 — Data foundation (roadmap feature 009). Goal: enough clean, multi-regime SPY 5-min history that a single backtest produces hundreds–thousands of trades. Scope: (1) Add Alpaca market-data as a bar source mirroring the existing yfinance downloader interface, writing rows with source='alpaca'. (2) Bulk-backfill CLI/endpoint that loops windows from ~2018 to present and idempotently upserts into the bars table, targeting distinct regimes (2020 vol, 2021 bull, 2022 bear, 2023–24 chop/trend). (3) Add a DB index on bars(bar_start). (4) Surface data coverage in the UI using /api/bars/coverage. Exit gate: ≥2–3 years of validated 5-min SPY bars cached across distinct regimes; a default backtest over the full span yields a few hundred+ trades."

> **Roadmap context**: This is Phase 0 of `docs/automated-trading-roadmap.md`. It is the current hard blocker: every downstream number (honest metrics, validation, paper trading) is meaningless without a statistically meaningful, multi-regime sample. The governing principle of the whole roadmap is *"build a process whose job is to try to prove the strategy wrong cheaply."* A six-trade backtest cannot prove anything wrong — this feature exists to make the sample big and varied enough that results start to mean something.

---

## Clarifications

### Session 2026-06-02

- Q: Source roles & cross-source dedup precedence (which bars feed backtests on overlap)? → A: Alpaca is the canonical multi-year series; yfinance auto-fetch stays but only fills the most-recent days Alpaca's free (IEX) feed has not yet served. On any overlapping 5-minute timestamp, **prefer Alpaca**.
- Q: Backfill delivery vehicle (CLI vs in-app)? → A: **In-app API endpoint + UI trigger** (CLI optional). Backfill runs as a background job that doesn't block the request, with progress/status surfaced to the operator while it runs.
- Q: What counts as a "covered" regime (for the exit gate and coverage display)? → A: A regime is **"covered" when ≥90% of its expected regular-session trading days** (weekdays minus market holidays) are present. Below 90% reads as a gap; the display shows per-regime % completeness.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Multi-year historical bars for a meaningful backtest (Priority: P1)

As the builder/operator, I want to load **years** of SPY 5-minute history from a reliable historical source so that a single backtest spans multiple market regimes and produces **hundreds to thousands** of trades instead of six — so the results are large enough to be worth interpreting.

**Why this priority**: This is the entire point of the phase and the hard blocker for Phases 1–5. Today the only data source serves ~60 calendar days, which yields a handful of trades — pure coin-flip noise. Without a large, multi-regime sample, no honest measurement or validation is possible. If only this story ships, the phase has delivered its core value.

**Independent Test**: Run the bulk backfill over the full target span, then run one default backtest over the entire cached range and confirm it executes **several hundred or more** trades drawn from multiple calendar years, completing in a reasonable time (seconds, not minutes).

**Acceptance Scenarios**:

1. **Given** an empty or sparse bar cache, **When** the operator runs the bulk backfill for the full target span, **Then** the system fetches and stores ≥2–3 years of regular-session SPY 5-minute bars spanning the targeted regimes (2020 volatility, 2021 bull, 2022 bear, 2023–24 chop/trend).
2. **Given** a fully backfilled cache, **When** the operator runs a default backtest over the entire cached span, **Then** the run produces at least several hundred trades and the result reports the full multi-year date range it covered.
3. **Given** a fully backfilled cache, **When** a backtest reads bars for any multi-year date range, **Then** the read returns promptly without a full-table scan (range reads remain fast as the cache grows).

---

### User Story 2 - Trustworthy data: one clean bar per timestamp, idempotent, validated (Priority: P2)

As the builder/operator, I want the cache to hold **exactly one clean, validated bar per 5-minute timestamp** even when two data sources have fetched the same period, and I want re-running a backfill to be safe (no duplicates, no corruption) — so that the larger sample I just gained doesn't silently introduce double-counted or garbage bars that would quietly inflate every downstream result.

**Why this priority**: Adding a second data source on top of the existing one creates a real correctness hazard — the same timestamp can now exist twice (once per source), and a naive range read would double-count it, corrupting every backtest. The roadmap's prime directive is *not fooling ourselves*; a sample that is bigger but wrong is worse than a sample that is small but honest. This is a must-have refinement on US1.

**Independent Test**: Cache an overlapping date range from both data sources, run a backtest over that range, and confirm the engine sees **exactly one bar per 5-minute timestamp**. Re-run the same backfill twice and confirm the total bar count is identical (idempotent) and no duplicate-per-timestamp rows are surfaced to the engine.

**Acceptance Scenarios**:

1. **Given** the same date range cached from both the historical source and the recent-fetch source, **When** a backtest reads that range, **Then** exactly one bar per 5-minute timestamp is delivered to the engine, chosen by a deterministic, documented source precedence.
2. **Given** a partially completed backfill, **When** the operator re-runs the same backfill, **Then** already-cached bars are not duplicated and the run completes idempotently (re-running yields the same effective bar count).
3. **Given** a fetch that returns a bar failing basic OHLC sanity (e.g., non-positive price, high < low) or falling outside the regular session (09:30–16:00 ET), **When** the backfill processes it, **Then** that bar is rejected and reported rather than stored.
4. **Given** a backfill run completes, **When** the operator reviews its outcome, **Then** they can see a summary of what happened: source used, date range covered, bars added, and any sessions that came back empty or with gaps (journaling / operator visibility).

---

### User Story 3 - Visible, educational data coverage (Priority: P3)

As the builder/operator, I want to see at a glance — inside the app — what date span and which regimes my cached data actually covers, with a plain-English explanation of why coverage matters, so I always know what foundation a given backtest is standing on and never mistake a thin sample for a broad one.

**Why this priority**: Sample size and regime coverage are the things this whole phase is about; if they're invisible, it's easy to run a backtest on a thin slice and over-trust it. This makes the foundation legible. It builds on US1/US2 but is independently shippable and is required by the educational-UI principle.

**Independent Test**: With data cached, open the app and confirm a coverage display shows the earliest and latest cached dates, an indication of which target regimes are covered, and a `?` help affordance explaining what coverage is, why it matters, and how the app uses it.

**Acceptance Scenarios**:

1. **Given** bars are cached, **When** the operator views the coverage display, **Then** it shows the effective cached date span (earliest → latest) and an at-a-glance indication of which target regimes are and are not covered.
2. **Given** a regime window is missing from the cache, **When** the operator views the coverage display, **Then** the gap is visibly surfaced (not hidden) so the operator knows the sample is incomplete.
3. **Given** the coverage concept is new to the user, **When** they open its `?` help, **Then** it explains in plain English what data coverage is, why sample size and regime breadth matter, and how the app uses coverage.

---

### Edge Cases

- **Holidays / empty windows**: a requested window contains no trading sessions (market holiday, weekend-only window) → backfill skips gracefully and records the window as legitimately empty, not as an error.
- **Source rate limits / transient errors**: the historical source throttles or times out mid-backfill → the run retries within limits and, on resume, does not re-create already-cached bars.
- **Interrupted backfill**: the run is stopped partway → re-running continues/repairs coverage without duplicating prior work.
- **Crashed / stuck backfill job**: a job whose process dies mid-run must not block future backfills forever. A "running" job that has gone stale (no progress past a configured TTL) is **not** counted against the per-user concurrency cap, so the operator can always re-trigger.
- **Most-recent bars unavailable from the historical source**: the historical source does not yet serve the very latest bars (e.g., current day) → the recent-fetch source fills that tail, and the two are reconciled to one bar per timestamp.
- **Overlap between sources**: both sources cover the same timestamp → deterministic precedence picks one; the engine never sees both.
- **Partial-session data**: a session returns fewer bars than a full regular session → the gap is recorded and surfaced in coverage rather than silently treated as complete.
- **Bad vendor bar**: a fetched bar violates OHLC sanity or session bounds → rejected and reported, never stored.
- **How far back the source can go**: the historical source's available history may start later than the ideal earliest date → backfill caches as far back as the source allows and the exit gate (≥2–3 years across distinct regimes) is still met.

---

## Requirements *(mandatory)*

### Functional Requirements

**Historical data source**

- **FR-001**: The system MUST support a historical SPY 5-minute bar source capable of serving **multiple years** of intraday history (far beyond the ~60-day window of the current source), and MUST tag bars from it with a distinct source identifier so they are distinguishable from existing cached bars.
- **FR-002**: The historical source MUST present the same fetch interface/shape as the existing downloader (request a date range + timeframe → receive validated bars + a fetch summary), so it is a drop-in additional source rather than a parallel pipeline.
- **FR-003**: Credentials for the historical source MUST be supplied via environment/configuration (never hard-coded or committed), and the configuration example MUST document the required keys with placeholder values.

**Bulk backfill**

- **FR-004**: The system MUST provide an **in-app operator-triggerable** bulk backfill (an API action with a UI control) that loads SPY 5-minute history across a long span (target ~2018→present, subject to source availability), automatically splitting the span into source-appropriate windows. A CLI MAY also be provided sharing the same backfill core, but the in-app trigger is the primary surface.
- **FR-004a**: The bulk backfill MUST run as a **background job** so the triggering request does not block on a multi-year fetch, and the operator MUST be able to see its **status/progress** while it runs (e.g., running/complete/failed and how far it has gotten).
- **FR-005**: The bulk backfill MUST be **idempotent**: re-running it over an already-cached range MUST NOT create duplicate bars and MUST NOT corrupt existing bars.
- **FR-006**: The bulk backfill MUST be **resumable/repairable**: after an interruption or partial failure, re-running it continues coverage without re-doing or duplicating completed work. A backfill job that crashed mid-run (stale "running" status past a configured TTL) MUST NOT permanently block new backfills against the per-user concurrency cap.
- **FR-007**: The bulk backfill MUST deliberately cover the targeted market regimes (2020 volatility, 2021 bull, 2022 bear, 2023–24 chop/trend) so the resulting sample spans varied conditions, not one period.
- **FR-008**: Each backfill run MUST produce a human-readable outcome record/summary including at least: source used, date range covered, number of bars added, and any sessions returned empty or with gaps.

**Data integrity**

- **FR-009**: When more than one source has cached a bar for the same 5-minute timestamp, the read path that feeds backtests MUST deliver **exactly one** bar for that timestamp, selected by a deterministic source precedence that **prefers Alpaca over yfinance** (Alpaca is the canonical multi-year series; yfinance only fills timestamps Alpaca has not served).
- **FR-010**: Stored bars MUST be validated: only regular-session (09:30–16:00 ET) 5-minute bars that pass basic OHLC sanity (positive prices, high ≥ low, high ≥ open/close ≥ low) are stored; bars that fail are rejected and reported.
- **FR-011**: Bar reads over large/multi-year date ranges MUST remain efficient as the cache grows (range queries MUST NOT degrade to full scans of the bar store).

**Coverage surfacing**

- **FR-012**: The system MUST expose the **effective** cached coverage (the deduped span the engine would actually see), including earliest and latest cached dates.
- **FR-013**: The app MUST display data coverage to the operator, including the cached date span and a per-regime **% completeness**, where a regime is shown as **covered** when ≥90% of its expected regular-session trading days (weekdays minus market holidays) are present and as a **gap** below 90%.
- **FR-014**: Any new concept introduced in the UI by this feature (data coverage, backfill, data source) MUST ship with a `?` help affordance answering, in plain English: what it is, why it matters, and how the app uses it (educational-UI principle).

**Scope guards (constitution alignment)**

- **FR-015**: All bars and operations MUST remain **SPY-only**; the system MUST NOT enable or accept any other instrument in this feature.
- **FR-016**: New data-layer interfaces SHOULD be written so a symbol parameter can be added later without a rewrite (symbol-parameterizable signatures), but MUST default to and hard-enforce SPY for now (no behavioral multi-symbol support in this feature).

### Key Entities *(include if feature involves data)*

- **Bar**: a single regular-session SPY 5-minute OHLCV record, identified by its start timestamp and the source that provided it. The atomic unit of all backtests.
- **Data source**: a provider of bars (the existing recent-window source and the new multi-year historical source). Each cached bar carries its source; sources have a defined read precedence when they overlap.
- **Backfill run**: an operator-initiated bulk fetch over a date span. Produces a summary (source, range, bars added, empty/gapped sessions) and is idempotent/resumable.
- **Coverage**: the effective (deduped) cached span the engine would see, plus a regime breakdown indicating which target periods are present or missing.
- **Regime window**: a labeled historical period (2020 volatility, 2021 bull, 2022 bear, 2023–24 chop/trend) used as the yardstick for "multi-regime" coverage.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a full backfill, a single default backtest over the entire cached span executes **at least several hundred trades** (vs. ~6 today), drawn from multiple calendar years.
- **SC-002**: The cache holds **≥2–3 years** of validated regular-session SPY 5-minute bars (on the order of tens of thousands of bars), with **all four** targeted regimes (high-vol, bull, bear, chop/trend) meeting the "covered" bar of **≥90% of expected trading sessions present**.
- **SC-003**: Re-running the full backfill is **idempotent** — the effective (engine-visible) bar count is unchanged on the second run, with zero duplicate-per-timestamp bars delivered to the engine.
- **SC-004**: An operator can determine the exact cached date span **and** which target regimes are covered **from within the app**, without querying the database directly.
- **SC-005**: A backtest over any range that two sources both cached delivers **exactly one** bar per 5-minute timestamp (no double counting), verifiable on a known overlapping fixture.
- **SC-006**: Loading the bars for a multi-year backtest completes in **seconds**, and stays fast (no full-scan regression) as the cache grows to multi-year size.
- **SC-007**: A backfill run leaves a reviewable record of what it did (source, range, bars added, gaps), so coverage quality is auditable after the fact.

---

## Assumptions

- **Historical source = Alpaca market data.** Per the roadmap's open decision, Alpaca is adopted as the historical bar source because it serves multi-year intraday history and is the same vendor we will trade through later. The existing yfinance source is **kept as a fallback** for the most-recent window the historical source may not yet serve.
- **Source precedence (deduplication rule).** *(Confirmed in clarify — Session 2026-06-02.)* When both sources have a bar for the same timestamp, the historical (Alpaca) bar is preferred as the canonical record, with the recent-fetch (yfinance) source filling only timestamps Alpaca does not cover. This keeps a multi-year backtest internally consistent rather than stitched from two vendors mid-series.
- **Backfill vehicle = in-app endpoint + UI trigger** *(confirmed in clarify — Session 2026-06-02)*. The bulk backfill is triggered from within the app via an API action with a UI control, running as a background job with progress surfaced to the operator. A CLI sharing the same backfill core MAY also be provided (mirroring the `seed_bars_from_csv.py` pattern: argparse + env auth + chunked upserts) but is optional, not the primary surface.
- **History depth is source-bounded.** The backfill targets ~2018→present, but if the source's free/available history begins later, caching as far back as the source allows is acceptable provided the ≥2–3-year, four-regime exit gate is still met.
- **Schema stays SPY-implicit.** The bar store has no symbol column today; this feature does **not** add one. Symbol-parameterizable code signatures are encouraged for future expansion, but multi-symbol data is explicitly out of scope (constitution Principle I).
- **Migrations are applied manually.** Any new database object (e.g., the range index) is authored as a migration file but applied by hand in the Supabase SQL editor, per existing project practice.
- **TDD throughout.** All in-scope backend/frontend code is built test-first (constitution Principle IV); this is assumed by every functional requirement even where not restated.
- **Regular session only.** Coverage and backfill concern the regular trading session (09:30–16:00 ET), 5-minute bars, consistent with existing engine assumptions.

## Dependencies

- Valid Alpaca market-data credentials available to the backend environment.
- The existing bar store, downloader interface, materialization path, and coverage endpoint (extended by this feature, not replaced).
- Feature 007 is consciously deferred (its remaining tasks are out of scope here), satisfying the roadmap's "one spec in flight" sequencing rule before opening 009.
