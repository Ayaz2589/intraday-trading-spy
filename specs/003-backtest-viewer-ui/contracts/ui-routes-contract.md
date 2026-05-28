# UI Routes Contract

The frontend exposes exactly two routes. Both are client-side via
react-router; no server-side rendering.

---

## `GET /`

**Purpose**: Landing route. Redirects to the most recent run if any
exist; shows an empty state otherwise.

**Behavior**:
1. On mount, fetch `GET /api/runs`.
2. If response is non-empty array, redirect (via `<Navigate to>`)
   to `/runs/{response[0].run_id}` (the newest run, since the API
   sorts newest-first).
3. If response is `[]`, render the empty state:
   - Headline: "No backtest runs yet"
   - Body: "Run a backtest to populate this viewer."
   - Code block (copy-paste): `make backtest`
4. If the fetch fails, render an error state with the HTTP status and
   a "Retry" button.

**Tested by**: `frontend/src/routes/root.test.tsx`.

---

## `GET /runs/{run_id}`

**Purpose**: The Backtest Viewer page.

**Behavior**:
1. On mount or when `run_id` changes, kick off three parallel fetches:
   - `GET /api/runs/{run_id}/manifest`
   - `GET /api/runs/{run_id}/summary`
   - `GET /api/runs/{run_id}/journal`
2. Optionally a fourth fetch for bars:
   - `GET /api/runs/{run_id}/bars` — but this is fired only when the
     `PriceChart` mounts (lazy load).
3. While all three primary fetches are pending, render a loading
   skeleton for each section.
4. If any fetch returns 404, render an inline error in that section
   identifying the missing file.
5. If a fetch is in-flight when `run_id` changes (user clicked a
   different run in the sidebar), cancel it via the
   `AbortController` (see research.md Decision 6) and start the new
   fetch.

**Page layout**:

```
┌─────────────────────────────────────────────────────────────────┐
│  RunsSidebar      │  RunHeader                                  │
│  (fixed left)     │  ─────────────────────────────────────────  │
│                   │  SummaryMetricsCard   RejectionBreakdownCard│
│  • run-id-1 ←sel  │  ─────────────────────────────────────────  │
│  • run-id-2       │  PriceChart (P2)                            │
│  • run-id-3       │  + SessionPicker (P2)                       │
│  • ...            │  + Trade markers (P3)                       │
│                   │  ─────────────────────────────────────────  │
│                   │  JournalTable                               │
│                   │  + Status filter chips (P5)                 │
└─────────────────────────────────────────────────────────────────┘
```

**Tested by**: `frontend/src/routes/run-viewer.test.tsx`.

---

## Route params validation

`run_id` (string) — react-router pattern matches `/runs/:run_id` with
no validation. If the API returns 404 for that run id, the page
renders an error state with a "back to /" link.

---

## Browser back/forward

react-router handles browser navigation natively. The selected run
in the sidebar is derived from the URL; clicking the back button
loads the previously viewed run.

---

## State persistence

No client-side persistence in v1 (no localStorage, no IndexedDB).
The URL is the only source of truth for "which run is selected." The
journal filter (per FR-005) lives in `useState` and is not
URL-encoded; switching runs resets the filter to "all."

---

## Tests required by FR-012

| File | Component / Route | Minimum coverage |
|---|---|---|
| `frontend/src/routes/root.test.tsx` | `/` redirect + empty state | redirect when runs exist; empty state when no runs; error state on fetch failure |
| `frontend/src/routes/run-viewer.test.tsx` | `/runs/{run_id}` | section rendering with fixture data; 404 handling for each endpoint; HelpTooltip contract enforcement |
| `frontend/src/components/help-tooltip.test.tsx` | `<HelpTooltip>` | renders ? icon; opens on hover; opens on click; closes on Escape; uses HELP_CONTENT for title + description |
| `frontend/src/components/runs-sidebar.test.tsx` | `<RunsSidebar>` | renders runs newest-first; highlights selected; click navigates |
| `frontend/src/components/run-header.test.tsx` | `<RunHeader>` | renders all fields; truncates sha256 to 8 chars |
| `frontend/src/components/summary-metrics-card.test.tsx` | `<SummaryMetricsCard>` | renders all 8 metrics; shows "—" for nulls; HelpTooltip next to each measure |
| `frontend/src/components/rejection-breakdown-card.test.tsx` | `<RejectionBreakdownCard>` | renders sorted by count desc; shows total; HelpTooltip on heading |
| `frontend/src/components/journal-table.test.tsx` | `<JournalTable>` | renders all rows; filter chips (P5); StatusBadge for each row |
| `frontend/src/components/status-badge.test.tsx` | `<StatusBadge>` | colored badge per status |
| `frontend/src/components/price-chart.test.tsx` | `<PriceChart>` | renders bars; renders VWAP line; renders OR band; renders trade markers; respects journal filter (P5) |
| `frontend/src/components/session-picker.test.tsx` | `<SessionPicker>` | renders sessions; selecting one fires callback |
| `frontend/src/api/client.test.ts` | `client.ts` fetch wrappers | each endpoint typed-fetch; 404 mapping; AbortController integration |
