# Feature Specification: Backtest Viewer UI

**Feature Branch**: `003-backtest-viewer-ui`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Feature 003 of intraday-trade-spy: a
single-page React + TypeScript + Vite + Tailwind + shadcn/ui web app
that lets the user select a backtest run from
`backend/data/backtests/` and visualize it — candlestick chart with
VWAP and opening-range overlay, full trade journal table, summary
metrics, and rejection breakdown. Every important concept ships with
a `?` HelpTooltip per constitution principle VI. Includes a tiny
FastAPI static server that exposes the on-disk run artifacts so the
frontend can fetch them via `/api/*`. This is NOT the full master
plan §19 frontend — that stays as later features."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select a run; see summary + journal (Priority: P1)

A solo developer who built the backtester now wants to study its
output visually rather than by reading CSVs. They open the viewer in a
browser, see a sidebar listing every backtest run they've ever
produced, click the most recent one, and see — without scrolling — the
run's summary metrics, the full trade journal as a table, and a
rejection breakdown grouped by reason.

**Why this priority**: Without P1, the feature delivers no value over
the current `cat journal.csv` workflow. P1 alone replaces the manual
CSV-reading loop with a sortable, searchable, scannable view.

**Independent Test**: Open the app at `http://localhost:5173/`. Click
any run in the sidebar. Confirm four sections render: header (run id +
metadata), summary metrics card, journal table, rejection breakdown
card. No chart yet (that's P2). No filtering yet (that's P5).

**Acceptance Scenarios**:

1. **Given** at least one run exists under `backend/data/backtests/`,
   **When** the user loads `/`, **Then** the sidebar lists every run
   sorted newest first by run start time.
2. **Given** a run is selected, **When** the page renders, **Then** it
   shows the run id, started_at, code_version, and the first 8 chars
   of the data fingerprint sha256 in a header.
3. **Given** a run is selected, **When** the journal table renders,
   **Then** every row from the run's `journal.csv` is present with
   columns: timestamp, status, setup, planned_entry, stop_loss,
   take_profit, quantity, actual_entry, actual_exit, exit_reason,
   realized_pnl, realized_r, vwap, or_high, or_low,
   distance_from_vwap_pct, reason, rejection_check.
4. **Given** a run is selected, **When** the summary card renders,
   **Then** it shows: total trades, wins / losses, win rate, average
   R, total R, max drawdown, profit factor.
5. **Given** a run is selected and it has at least one rejection,
   **When** the rejection breakdown card renders, **Then** it lists
   each `rejection_check` with its count, sorted by count descending.

---

### User Story 2 - Candlestick chart with VWAP + OR overlay (Priority: P2)

The developer wants to see the price action of the run's underlying
SPY 5-minute bars, with the VWAP line and opening-range bands drawn on
top. One session at a time; a picker lets them switch between sessions
when the run spans multiple days.

**Why this priority**: P2 is the *real* reason the feature exists. The
journal table tells you WHAT happened; the chart tells you WHY. P1
ships first because it's mechanically simpler and validates the
data-fetching plumbing; P2 is what closes the "I want to visualize
this" loop.

**Independent Test**: Pick any run that has bar data on disk. Confirm
the candlestick chart renders with VWAP as a line overlay and the
opening-range high/low as horizontal bands during the OR window. If
the run spans multiple sessions, confirm a session picker is present
and switching sessions updates the chart.

**Acceptance Scenarios**:

1. **Given** a run with bar data, **When** the chart renders, **Then**
   it shows OHLC candles (green for close ≥ open, red for close <
   open) along a timestamp x-axis.
2. **Given** the chart is rendered, **When** the user looks at it,
   **Then** the VWAP value at each bar is shown as a line.
3. **Given** the chart is rendered, **When** the user looks at the
   first 15 minutes of the session, **Then** the opening-range high
   and low are shown as horizontal bands during the OR window.
4. **Given** the run spans multiple sessions, **When** the user picks
   a different session from a picker, **Then** the chart, VWAP, and OR
   bands update to that session's data.
5. **Given** the chart's session has a tight price range,
   **When** the chart renders, **Then** the y-axis auto-zooms so VWAP
   and bar bodies are visually distinguishable.

---

### User Story 3 - Mark trade events on the chart (Priority: P3)

The developer wants to see where each executed trade entered and
exited overlaid on the candlestick chart, color-coded by outcome.

**Why this priority**: Once the chart is there, the trade markers are
the next obvious thing. They convert the journal-table-driven workflow
into a chart-driven one: you see a winning trade at a glance.

**Independent Test**: Pick a run with at least one executed trade.
Confirm the chart shows an entry marker at the executed-row timestamp
and an exit marker at the exited/force_flat row timestamp. Hover an
exit marker; see realized R and dollar pnl. Toggle rejection markers
on; see tiny rejection icons at signal-emit timestamps.

**Acceptance Scenarios**:

1. **Given** a run with executed trades, **When** the chart renders,
   **Then** each `executed` row places an upward triangle entry marker
   at that bar with the entry price labeled.
2. **Given** the same run, **When** the chart renders, **Then** each
   `exited` / `force_flat` row places an exit marker color-coded:
   green=target, red=stop, gray=force_flat.
3. **Given** the user hovers an exit marker, **When** the tooltip
   shows, **Then** it displays realized R and dollar pnl.
4. **Given** the rejection-marker toggle is OFF, **When** the chart
   renders, **Then** no rejection icons appear.
5. **Given** the rejection-marker toggle is ON, **When** the chart
   renders, **Then** each `rejected` row places a small `×` icon at
   that bar timestamp; hover shows the rejection_check.

---

### User Story 4 - HelpTooltip on every concept (Priority: P4)

Per constitution principle VI, the UI must explain every concept it
exposes. The user (or any future visitor) can hover the small `?`
icon next to any label to get a plain-English explanation that answers
*what is this*, *why does it matter*, and *how is the app using it*.

**Why this priority**: This is a NON-NEGOTIABLE constitutional
requirement. P4 is tagged here only to call it out as an explicit
deliverable; in practice the HelpTooltips ship alongside the
components they label in P1–P3.

**Independent Test**: Walk the rendered page and hover every `?`
icon. Confirm each opens a popover with title + description.
Additionally: an automated test scans the rendered DOM and asserts
that for every concept listed in the FR-008 contract list, a
HelpTooltip is present.

**Acceptance Scenarios**:

1. **Given** a concept label that appears on the page, **When** the
   user hovers or clicks the `?` icon next to it, **Then** a popover
   opens showing a title and a short description.
2. **Given** every concept listed in FR-008's contract list, **When**
   the page is rendered, **Then** each one has a paired HelpTooltip.
3. **Given** a concept has no HelpTooltip content authored yet,
   **When** the page renders, **Then** the `?` icon shows
   "Documentation pending" rather than a blank popover.

---

### User Story 5 - Filter the journal by status (Priority: P5)

When studying a run with 100+ rejections and a handful of trades, the
user wants to focus on one status at a time without scrolling.

**Why this priority**: Useful but not strictly required to ship a
viable viewer. P1 already shows all rows; this just lets you focus.

**Independent Test**: Click "executed" — see only executed rows + entry
markers on the chart. Click "rejected" — see only rejection rows in
the table.

**Acceptance Scenarios**:

1. **Given** a run is loaded, **When** the user clicks a status filter
   chip (executed | exited | rejected | lockout | force_flat | all),
   **Then** the journal table shows only matching rows.
2. **Given** a status filter is active, **When** the chart renders,
   **Then** the chart's overlay markers respect the filter (e.g.,
   filter to "executed" → only entry markers visible).

---

### Edge Cases

- **No runs exist yet** — sidebar shows an empty state with the hint
  text "Run a backtest first" and a copy-pasteable command (`make
  backtest`).
- **A run's directory is missing a required file** (e.g., journal.csv
  present but summary.json absent) — the page shows an inline error
  naming which file is missing for which run.
- **A run's run.yaml references a data CSV no longer on disk** — the
  chart shows "Source data missing" but the journal and summary
  sections still render correctly.
- **The user switches runs mid-load** — the in-flight request is
  cancelled; no stale data is shown.
- **The journal has zero executed trades** (cap-blocked run) — the
  chart still renders without entry/exit markers; the summary cards
  correctly show "0 trades."
- **Chart has very tight price range** — y-axis auto-zooms so VWAP
  and bars don't collapse onto each other.
- **HelpTooltip content is missing for a concept** — the `?` icon
  shows "Documentation pending" rather than a blank popover.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a tiny HTTP API server at
  `backend/src/intraday_trade_spy/api/static_server.py` serving:
  - `GET /api/runs` — array of `{run_id, started_at, summary}` for
    every run directory under `backend/data/backtests/`, sorted
    newest-first by `started_at`.
  - `GET /api/runs/{run_id}/journal` — journal rows as a JSON array,
    parsed from the run's `journal.csv`.
  - `GET /api/runs/{run_id}/summary` — the run's `summary.json`.
  - `GET /api/runs/{run_id}/manifest` — the run's `run.yaml` parsed
    to JSON.
  - `GET /api/runs/{run_id}/bars` — the bar data CSV (parsed to JSON),
    read from the path in `run.yaml::config_snapshot.data.csv_path`.
  - All endpoints MUST return HTTP 404 with a descriptive JSON body
    when the run id or file does not exist.
- **FR-002**: Server MUST be invokable via a new console script
  `intraday-trade-spy-server` (default port 8000). Optional `--port`
  flag accepted.
- **FR-003**: Project root `Makefile` MUST gain a `ui-server` target
  that launches the API server, plus `ui-install`, `ui-dev`, and
  `ui-build` targets per FR-015.
- **FR-004**: Frontend MUST live at `frontend/` and use the stack
  React 19+, TypeScript, Vite, Tailwind CSS, shadcn/ui. Chart library
  decision (lightweight-charts vs recharts) is deferred to
  `/speckit-plan`.
- **FR-005**: Frontend MUST expose exactly two routes: `/` (landing
  that redirects to the most recent run if any exist) and
  `/runs/{run_id}` (the viewer).
- **FR-006**: The viewer MUST render, for the selected run: a header
  block (run_id, started_at, code_version, first 8 hex chars of
  data_fingerprint.sha256), a SummaryMetricsCard, a JournalTable
  showing every row, a RejectionBreakdownCard, and (per P2/P3) the
  PriceChart with VWAP + OR overlays + trade markers.
- **FR-007**: System MUST include a reusable `HelpTooltip` component
  with the API `<HelpTooltip title="..." description="..." />`. The
  component renders a small `?` icon and opens a popover on hover or
  click. The description MUST follow the three-part structure: *what
  is this*, *why does it matter*, *how is the app using it*.
- **FR-008**: Every concept in the following contract list MUST be
  paired with a `HelpTooltip` instance somewhere on the page:
  VWAP, Opening Range, R Multiple, Profit Factor, Max Drawdown, Win
  Rate, Rejected Signal, Position Cap, Cooldown, Lockout, Force-Flat
  Exit, Take-Profit, Stop-Loss, Risk per Trade, Daily Drawdown. An
  automated test MUST verify this contract.
- **FR-009**: Frontend dev mode MUST be invokable via
  `cd frontend && npm run dev` (default port 5173) and MUST proxy
  `/api/*` to the backend server on port 8000 via Vite's proxy
  config.
- **FR-010**: Frontend MUST produce a production build via
  `npm run build` that outputs static assets into `frontend/dist/`.
- **FR-011**: Frontend MUST include linting (ESLint with React +
  TypeScript + Tailwind plugins) and a `typecheck` script
  (`tsc --noEmit`). Both MUST pass with zero errors.
- **FR-012**: Per constitution principle IV (Test-First Everywhere),
  every non-trivial React component MUST be developed test-first
  using Vitest + React Testing Library. The HelpTooltip, JournalTable,
  RejectionBreakdownCard, SummaryMetricsCard, RunsSidebar, and
  PriceChart components MUST each have at least one rendering /
  interaction test.
- **FR-013**: The backend static server module
  (`backend/src/intraday_trade_spy/api/static_server.py`) MUST be
  developed test-first using FastAPI's `TestClient`. Each endpoint
  MUST have a happy-path test and at least one 404 test.
- **FR-014**: Frontend MUST NOT make any network calls at module-load
  time. All `fetch()` calls live inside React effects so tests can
  mock them.
- **FR-015**: Project root `Makefile` MUST gain four new targets:
  - `make ui-install` — `npm install` in `frontend/`
  - `make ui-dev` — `npm run dev` (Vite dev server)
  - `make ui-build` — `npm run build` (production static bundle)
  - `make ui-server` — launches the backend API server

### Key Entities

- **RunSummaryView** — the shape returned by `GET /api/runs`:
  `{run_id: str, started_at: ISO8601, summary: {total_trades: int,
  win_rate: float, total_r: float, max_drawdown_r: float, ...}}`.
- **JournalRowView** — one parsed row of `journal.csv` as JSON, with
  the same columns and semantics as Feature 001's `JournalEntry`.
- **BarView** — `{symbol: "SPY", timestamp: ISO8601, open: float,
  high: float, low: float, close: float, volume: int}`.
- **RunManifestView** — the parsed `run.yaml`: resolved config,
  data fingerprint, summary metrics, code version, run timestamps.
- React components (must exist as discrete files): `<RunsSidebar>`,
  `<RunHeader>`, `<SummaryMetricsCard>`, `<RejectionBreakdownCard>`,
  `<JournalTable>`, `<PriceChart>`, `<HelpTooltip>`, `<StatusBadge>`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a fresh clone can run `make ui-install &&
  make ui-server &` followed by `make ui-dev`, then open the browser
  and see the Backtest Viewer rendered with a sample run in under 5
  minutes (npm install included).
- **SC-002**: 100% line coverage on the API server module under
  pytest.
- **SC-003**: A DOM-scanning frontend test verifies that 100% of the
  concepts in the FR-008 contract list have a paired `HelpTooltip` on
  the page.
- **SC-004**: A non-developer can study a run end-to-end (price
  action, signals, executed trades, rejections, summary) without
  opening any CSV file in a terminal.
- **SC-005**: The frontend test suite runs in under 10 seconds on a
  developer laptop.
- **SC-006**: A new contributor can understand the data flow
  (frontend → `/api/*` → on-disk files in `backend/data/backtests/`)
  by reading the spec + plan + one source file (`static_server.py`).

## Assumptions

- The user has Node.js ≥20 (LTS) installed locally.
- The user runs the API server and the Vite dev server simultaneously
  during development (two terminals or two background `make` commands).
- Modern browsers only (latest Chrome / Firefox / Safari). No IE.
- Production deployment is out of scope; this feature ships a working
  dev workflow and a buildable static bundle, not a deployed site.
- The chart library choice (lightweight-charts vs recharts) is
  deferred to `/speckit-plan`.
- Feature 001's `backend/data/backtests/<run-id>/*` directory
  structure is the authoritative on-disk contract; this feature
  reads it, does not modify it.
- Constitution v1.1.0 governs this feature. Principle IV (Test-First
  Everywhere) and principle VI (Educational UI) are both load-bearing.

## Out of Scope

- Real-time / live updates (no websocket; runs are static once
  written).
- Multi-run comparison.
- Editing the config from the UI.
- Triggering backtests from the UI (`make backtest` remains the way).
- Authentication / authorization (single-developer tool).
- Mobile / responsive layout (desktop only for v1).
- The other 4 master-plan pages (Dashboard, Strategy, Risk,
  Journal-as-search) — each becomes its own later feature.
- Server-side rendering / Next.js — pure Vite SPA.
- Dark mode toggle (default theme only; not both).
