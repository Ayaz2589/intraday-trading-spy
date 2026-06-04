# Feature Specification: Data Observability — coverage, backfill history & lineage

**Feature Branch**: `013-data-observability`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Flesh out the Data coverage page so the operator can understand WHAT HAPPENED: what a backfill job actually did (with history), what's in the bars cache, where the holes are, and what the data feeds." Authoritative user-approved design: `docs/superpowers/specs/2026-06-04-data-observability-design.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand what a backfill did (Priority: P1)

After triggering a backfill, the operator sees a history of recent backfill jobs
— when each ran, what date range it targeted, how far it got, how many bars it
added, how long it took, and whether it succeeded — instead of a single status
line that is overwritten by the next job. A failed job stays visible with its
failure reason (the trigger for this feature: a job failed with a module error,
then vanished from view as soon as the next job ran).

**Why this priority**: This is the pain that motivated the feature — "finished ·
windows 103/103 · 1 bars added" answered almost nothing, and the prior failure
was unrecoverable from the UI. It is also the cheapest slice: the job records
already exist and only need to be shown.

**Independent Test**: Run two backfills (one that fails, one that succeeds).
Both appear in the history with start time, range, windows, bars added,
duration, and status; the failed row exposes its failure reason.

**Acceptance Scenarios**:

1. **Given** several past backfill jobs exist, **When** the operator opens the
   Data page, **Then** a job-history list shows the most recent jobs (newest
   first) with started time, date range, windows done/total, bars added,
   duration, and status.
2. **Given** a job failed, **When** the operator inspects its row, **Then** the
   failure reason is visible (e.g. on hover/tap) — even after newer jobs have
   run.
3. **Given** a job is currently running, **When** the operator watches the
   page, **Then** its live progress continues to update as it does today, and
   on completion the history and coverage sections refresh automatically.

---

### User Story 2 - See what's in the cache (Priority: P2)

The operator sees, at a glance, what the cached dataset contains: total bars,
total trading sessions, the covered date span, where the data came from, and
when the cache last changed — plus a year-by-month completeness grid (heatmap)
showing at a glance which months are fully cached.

**Why this priority**: "What do I actually have?" is the foundation for
trusting any backtest range. Today only the earliest→latest span is shown.

**Independent Test**: With a populated multi-year cache, load the Data page and
verify the totals line and a month-grid whose cells reflect each month's
completeness; a month in the future (or before the cached span) renders as
not-cached, and the current month renders as in-progress.

**Acceptance Scenarios**:

1. **Given** a populated cache, **When** the page loads, **Then** a summary
   shows total bars, total sessions, earliest→latest dates, the data source(s),
   and a last-updated time.
2. **Given** the cached span, **When** the heatmap renders, **Then** every
   month in the span shows one of: complete, partial, current-month
   (in-progress), or not-cached/future — and a legend explains the states.
3. **Given** the current month, **When** it renders, **Then** it is judged only
   against the trading sessions that have already occurred (it is not marked
   "partial" for days that haven't happened yet).

---

### User Story 3 - Spot the holes (Priority: P3)

For any month that is not complete, the operator can see exactly which trading
days are missing — with market holidays and half-days already excluded, so any
listed day is a *real* gap. When nothing is missing, the page says so
explicitly.

**Why this priority**: This is the trust question — "can I run a backtest over
range X?" — but it depends on US2's grid existing first.

**Independent Test**: With a month that has a removed/absent trading session,
the heatmap shows that month as partial, and inspecting it lists the exact
missing date(s); a market holiday in the same month is NOT listed as missing.

**Acceptance Scenarios**:

1. **Given** a month missing one trading session, **When** the operator
   hovers/taps that cell, **Then** the exact missing date(s) are listed.
2. **Given** a month whose only non-trading weekdays are market holidays,
   **When** it renders, **Then** it shows as complete and lists no missing
   days.
3. **Given** a fully complete cached span, **When** the page renders, **Then**
   an explicit "no missing sessions" indication appears.

---

### User Story 4 - Know what the data feeds (Priority: P4)

The operator sees a one-line connection between the data and the research built
on it: how many backtests and validation studies have run against the cache and
when the most recent one ran, with a link to the Runs page.

**Why this priority**: Connects the data page to the research it powers, but it
is a summary only — deep per-run lineage is deferred to the planned insights
feature.

**Independent Test**: With existing runs and studies, the summary line shows
their counts and the latest run date, and navigates to the Runs page.

**Acceptance Scenarios**:

1. **Given** runs and studies exist, **When** the page loads, **Then** a line
   shows "feeds N backtests + M studies · latest <date>" with a working link to
   the Runs page.
2. **Given** no runs exist yet, **When** the page loads, **Then** the line
   degrades gracefully (e.g. "no backtests yet") rather than showing an error.

---

### Edge Cases

- **Empty cache**: the page keeps today's "no bars cached yet" experience; the
  heatmap and summary render an empty state, not an error.
- **Stats unavailable**: if the coverage/stats data cannot be loaded, only that
  section shows a "couldn't load cache stats" message — the rest of the page
  (regime table, backfill controls, job history) still works. No full-page
  failure.
- **Backfill completes while viewing**: the summary, heatmap, and job history
  refresh automatically when a running job reaches finished or failed.
- **Months at the span edges**: months before the earliest cached date or after
  the latest are not-cached/future — they are never counted as "missing".
- **Current month**: judged only against sessions elapsed to date (in the
  market's timezone), displayed as in-progress.
- **Very long histories**: the job list is capped at the most recent 20 jobs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Data page MUST display a history of the most recent backfill
  jobs (up to 20, newest first), each with: start time, requested date range,
  windows done/total, bars added, duration, and status.
- **FR-002**: Failed jobs MUST remain visible in the history with their failure
  reason accessible, regardless of newer jobs.
- **FR-003**: The existing live progress display for an in-flight backfill MUST
  be preserved, and the page's coverage/summary/history sections MUST refresh
  automatically when a job completes (success or failure).
- **FR-004**: The page MUST display cache totals: bar count, distinct trading
  session count, earliest→latest covered dates, the contributing data
  source(s), and when the cache last changed.
- **FR-005**: The page MUST display a month-grid completeness heatmap (rows =
  years from the earliest cached year to the current year; cells = months) in
  which every cell renders exactly one of four states: complete, partial,
  current-month (in-progress), or not-cached/future, with a visible legend.
- **FR-006**: For any partial month, the operator MUST be able to reveal the
  exact missing trading dates via hover/tap on the cell.
- **FR-007**: Expected trading sessions MUST derive from the official NYSE
  market calendar (holidays and half-days excluded), so every date reported as
  missing is a genuine gap.
- **FR-008**: The current month MUST be evaluated only against sessions that
  have already elapsed (market timezone) and MUST be visually distinguished as
  in-progress.
- **FR-009**: When the cached span has no missing sessions, the page MUST say
  so explicitly.
- **FR-010**: The page MUST display a lineage summary: the count of backtests
  and the count of validation studies that have been run, the date of the most
  recent, and a navigation link to the Runs page. (Per-run/per-range lineage
  drill-down is out of scope.)
- **FR-011**: Page sections MUST fail independently: an error loading the
  cache stats affects only that section; the rest of the page remains
  functional. An empty cache preserves the existing "no bars yet" message.
- **FR-012**: The existing regime completeness table MUST remain on the page,
  unchanged in behavior.
- **FR-013**: Every new concept MUST ship with an educational `?` tooltip:
  the completeness heatmap (what the states mean; holidays excluded), the
  backfill job history (what a job/window is; why "1 bars added" over a full
  cache is healthy — duplicates are skipped), and the lineage line (what
  "feeds N backtests" means).
- **FR-014**: The page MUST remain read-only with respect to the cache and job
  records: no new mutations beyond the existing backfill trigger.

### Key Entities

- **Backfill job record**: an already-persisted record of one backfill request
  — status, requested range, progress (windows), bars added, gap dates,
  failure reason, created/updated times. This feature *lists* them; it does not
  change how they are written.
- **Cache month stat**: per calendar month — sessions present vs expected,
  bar count, contributing source(s), and missing dates (empty when complete).
- **Cache totals**: whole-cache aggregates — bars, sessions, date span,
  source(s), last-changed time.
- **Lineage summary**: counts of backtests and validation studies executed plus
  the most recent run date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a backfill completes, the operator can answer — without
  leaving the Data page — when it ran, what range it covered, how many bars it
  added, how long it took, and whether it succeeded. (Today: none of these.)
- **SC-002**: A failed backfill's reason remains discoverable on the page after
  at least one newer job has run. (Today: it is overwritten immediately.)
- **SC-003**: For any month in the cached span, the operator can determine
  complete-vs-partial at a glance, and for a partial month can list the exact
  missing trading days in at most 2 interactions (locate cell → hover/tap).
- **SC-004**: A fully covered span is confirmed by an explicit "no missing
  sessions" statement — the operator never has to infer completeness.
- **SC-005**: With a full multi-year cache (~165k bars), the page's new
  sections render their data on initial load in under 3 seconds.
- **SC-006**: Every new concept introduced by this feature has a rendered `?`
  tooltip (3 new help concepts), keeping the educational-UI guarantee.
- **SC-007**: The lineage line's counts match the Runs page (same number of
  runs/studies) and its link lands on the Runs page.

## Assumptions

- SPY remains the only symbol (constitution I); the heatmap does not need a
  symbol dimension.
- The bars cache is shared app-wide (existing model); per-user data isolation
  is unchanged by this read-only feature.
- "Expected trading sessions" reuses the same NYSE-calendar logic that already
  powers the regime completeness table — no new calendar source.
- "When the cache last changed" derives from existing records (e.g. the most
  recent successful backfill completion or bar ingestion time); exact source is
  a planning decision.
- The job-history records (including timestamps, gap dates, failure reasons)
  already exist and are already being written; this feature only reads them.
- Job history capped at 20 entries (user-approved design decision); older jobs
  remain stored, just not displayed.
- Light lineage = whole-cache counts, not per-range joins; the insights feature
  (now pencilled as 015) owns deep lineage. The roadmap's pencilled "013 study
  child-runs" shifts to 014.
