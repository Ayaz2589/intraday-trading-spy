# Data page redesign — to the user's mockup

**Date:** 2026-06-04 · **Status:** approved (mockup provided by user; decisions
confirmed) · **Scope:** frontend-only design iteration on Feature 013 — zero
backend/API changes; the design doc is the spec (no new Spec Kit feature).
**Branch:** `redesign/data-page`.

## User-confirmed decisions

1. The monthly **bar chart replaces** the grid heatmap (bar height = sessions
   cached; hover keeps the exact-missing-days detail; an orange "partial" state
   covers the case the mockup doesn't show).
2. Job history scope = the **20 most recent jobs** with an honest subtitle
   (not the mockup's "last 24 hours" wording).
3. `?` HelpTooltips stay on section headers (constitution VI) even though the
   mockup omits them. No new help concepts → no new keys; `cache_heatmap` copy
   reworded cell→bar.

## Component breakdown (panel becomes a thin composer)

```
DataCoveragePanel
├── header: "Data coverage" + "Historical SPY 5-min bar cache — backfill,
│   completeness, and job history". The old span <p> remains ONLY as the
│   fallback/empty state when stats are unavailable.
├── DataStatCards   — CACHED BARS · SESSIONS · COVERAGE SPAN (gradient fill =
│   Σsessions_present/Σsessions_expected) · SOURCES (alpaca "primary",
│   yfinance "fallback" chips — mirrors data.source_preference order)
├── StatusStrip     — ✓ no-missing pill (red + count when gaps) · "Symbol SPY ·
│   Interval 5 min · Updated <last_updated>" · lineage line + Runs → (right)
├── CacheBarChart   — one bar/month: green complete, blue current, orange
│   partial, grey dash future; year labels group bars; summary line
│   "<N> months fully cached · <Month YYYY> in progress · <M> months ahead not
│   yet cached" (+ partial count when any); legend; hover title = same text as
│   the old heatmap incl. missing dates
├── RegimeCards     — the regime table becomes 4 cards: name, x/y sessions,
│   big mono %, covered/gap pill (testids preserved), progress bar
├── BackfillCard    — preset chips (Last 30 days · Last 90 days · Year to date ·
│   Full history), FROM→TO inputs (editing deselects chips), estimate line
│   "N windows · est <t> · cached sessions skipped", helper copy (alpaca →
│   yfinance fallback; "currently has no gaps" when stats say so), launch
│   button + live job progress (existing behavior/testids preserved)
└── JobHistoryTable — stats row (TOTAL · FINISHED · FAILED · BARS ADDED over
    the shown jobs), table w/ windows mini progress bar, "+N" bars, took,
    status pill; FAILED rows expand (chevron) → FAILURE REASON panel +
    "Retry this range" button
```

Removed: `CacheHeatmap` (+test) and `CacheSummary` (+test) — superseded by
`CacheBarChart`, `DataStatCards`, `StatusStrip` (assertions ported).

## New pure logic (own modules, unit-tested)

- `lib/backfill-presets.ts` — `presetRange(preset, today)` for
  last30/last90/ytd/full (full = 2018-01-01 → today).
- `lib/backfill-estimate.ts` — `estimateWindows(start, end)` =
  ceil(inclusiveDays / 30) (mirror of `api.backfill.window_days`, commented);
  `estimateDurationMs(jobs, windows)` = median per-window pace of finished
  jobs × windows (null without usable history); `jobStats(jobs)` totals.

## Wiring

State stays in the panel: it owns `jobId` + the start-backfill mutation and
passes `onLaunch(start, end)` to BackfillCard and `onRetry(start, end)` to
JobHistoryTable — retry is literally the same mutation with the failed row's
exact range, feeding the same live poller and auto-refresh. Queries (stats /
coverage / jobs), localStorage instant-paint, section-independent failure: all
unchanged.

## Testing

New unit tests for presets/estimate/jobStats; component tests for
DataStatCards, StatusStrip, CacheBarChart (ported state/hover/missing-day/
legend assertions + year labels + summary line), RegimeCards (pill testids),
JobHistoryTable (stats row, expand, retry callback); panel composition test
updated. Existing testids preserved where tests rely on them
(`coverage-span` fallback, `regime-status-*`, `backfill-*`, `job-history`).
Full frontend typecheck + vitest; backend untouched (suite re-run as
regression guard only).
