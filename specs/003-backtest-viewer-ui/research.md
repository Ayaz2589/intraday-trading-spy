# Phase 0 Research: Backtest Viewer UI

Each decision below resolves a "NEEDS CLARIFICATION" implicit in the
spec or technical context. Format: decision, rationale, alternatives.

---

## Decision 1 — Chart library: lightweight-charts v5+

**Decision**: TradingView's `lightweight-charts` v5+, wrapped in a
React component via `useRef` + `useEffect`.

**Rationale**:
- Purpose-built for OHLC candlesticks; bar rendering looks
  professional out of the box.
- Has first-class support for the overlays we need: line series
  (VWAP), price lines (OR high/low), markers (trade entries/exits),
  and tooltips.
- Bundle size ~150 KB minified — acceptable for a single-page
  research tool.
- Imperative API but the React seam is well-trodden: store the chart
  instance in a `useRef`, create series in a `useEffect` that
  depends on data, dispose on unmount.

**Alternatives considered**:
- *recharts*: declarative React API but candlesticks require composing
  Bar + custom Shape. More code, less idiomatic for OHLC.
- *Apache ECharts via echarts-for-react*: very flexible, native
  candlesticks, but ~900 KB bundle. Worth the cost only if we
  anticipated many other chart types.

---

## Decision 2 — shadcn/ui: copy-paste, not runtime dep

**Decision**: Use `npx shadcn@latest add ...` to copy specific
components (Card, Table, Badge, Tooltip, Tabs, Button) into
`frontend/src/components/ui/`. The components become ours; we own and
modify them.

**Rationale**:
- shadcn/ui is the master plan §18's recommended UI library style
  ("shadcn/ui-style components if desired").
- Copy-paste means no runtime package to upgrade and no opaque
  styling overrides; the components are plain TSX in our tree.
- Built on Radix UI primitives → keyboard-accessible by default.
- The HelpTooltip primitive becomes a thin wrapper around shadcn's
  Tooltip + a `?` icon.

**Alternatives considered**:
- *MUI / Mantine / Ant Design*: opinionated runtime packages, heavier,
  more styling friction with Tailwind.
- *Hand-coded primitives*: more authentic to the master plan's
  "lightweight" spirit but slower to ship.

---

## Decision 3 — HelpTooltip: single component + single dictionary

**Decision**: Exactly one `HelpTooltip` component +  exactly one
`help-content.ts` dictionary keyed by `HelpContentKey` (a string
literal union). Every component imports tooltip content from the
dictionary via a typed key — no inline strings.

The contract test iterates the dictionary keys, renders the page, and
asserts every key has at least one rendered HelpTooltip instance with
that title.

**Rationale**:
- Constitution principle VI is the *whole reason* this feature
  exists; making the contract testable matters more than minor
  ergonomics.
- TypeScript literal-union keys prevent typos at compile time.
- A central dictionary makes "what does the UI explain?" a single
  file to review.

**Alternatives considered**:
- *Inline title/description strings on each `<HelpTooltip>`*: less
  testable (no central registry to iterate), drift-prone.
- *i18n framework*: overkill for a single-developer English-only
  tool.

---

## Decision 4 — Static server: FastAPI, no DB, ~150 lines

**Decision**: A single Python module
(`backend/src/intraday_trade_spy/api/static_server.py`) defines a
FastAPI app with 5 endpoints. Reads from disk on every request (no
caching for v1). Uses `yaml.safe_load` for `run.yaml`, `csv` stdlib
for CSV parsing, `json.loads` for `summary.json`. Adds CORS middleware
permitting `http://localhost:5173`.

A `main()` function takes `--port` (default 8000) and calls
`uvicorn.run(app, ...)`. Exported as the console script
`intraday-trade-spy-server`.

**Rationale**:
- FastAPI is already in master plan §22 as the eventual API layer;
  starting with a minimal FastAPI app means Feature 004 can extend
  the same app rather than starting over.
- No DB needed: the on-disk run directories ARE the database. The
  server is a thin file → JSON adapter.
- Reading on every request is fine for the dataset size (~270 rows
  max per journal, 780 bars max per run).

**Alternatives considered**:
- *Python stdlib `http.server`*: would work, but a tiny FastAPI app
  has nicer routing, automatic JSON encoding, and TestClient support.
- *Cache responses in memory*: premature for current scale; revisit if
  reads become slow.

---

## Decision 5 — Vite dev proxy + production assumption

**Decision**: `frontend/vite.config.ts` configures a dev-server proxy
that forwards `/api/*` to `http://localhost:8000`. The production
build (`frontend/dist/`) is static; it assumes a reverse proxy or
same-origin deployment fronts both the API and the static assets.

**Rationale**:
- Dev-time: the React app fetches `/api/runs` and Vite forwards
  transparently — no CORS pain, no host code paths.
- Production deployment is out of scope (per spec); this just
  documents the assumption so a future deployment feature has a
  clear starting point.

**Alternatives considered**:
- *Build static assets into the FastAPI app and serve from the same
  process*: tighter coupling but breaks the clean dev workflow.
- *Hardcode `http://localhost:8000` in the frontend*: works for dev
  only; bad practice.

---

## Decision 6 — Cancelation on run-switch

**Decision**: Every `useEffect` that fetches data passes an
`AbortController.signal` to `fetch()` and returns a cleanup function
that calls `controller.abort()`. Switching runs while a fetch is
in-flight cancels the stale request, preventing the "last-wins" race.

**Rationale**:
- The spec calls this out as an edge case ("The user selects a run
  while the page is loading another").
- AbortController is the standard React idiom; no new dependency
  needed.

**Alternatives considered**:
- *react-query / SWR*: handle cancelation automatically + give you
  caching and dedupe for free. Worth adopting if state grows, but
  premature for two routes + four card components.

---

## Decision 7 — Tailwind v4 CSS-first config

**Decision**: Tailwind 4 uses CSS-first configuration via
`@import "tailwindcss"` + custom theme tokens in `globals.css`. No
`tailwind.config.ts` file (deprecated in v4).

**Rationale**:
- Tailwind 4 (released 2025) made the JS config file optional and
  prefers CSS variables for tokens.
- One less config file in the repo.

**Alternatives considered**:
- *Tailwind v3 with `tailwind.config.ts`*: would work but the
  ecosystem is moving to v4; starting on v4 avoids a near-term
  migration.

---

## Decision 8 — Test environment: happy-dom

**Decision**: Vitest runs with `environment: "happy-dom"` (not
jsdom). Tests use `@testing-library/react` + `@testing-library/jest-dom`
matchers.

**Rationale**:
- happy-dom is 3–5× faster than jsdom for typical React component
  tests.
- The Testing Library API is identical regardless of environment.
- SC-005 demands < 10 s test suite; happy-dom helps meet it.

**Alternatives considered**:
- *jsdom*: the de-facto standard but slower. Pick if a future test
  needs a feature happy-dom doesn't support (rare).

---

## Decision 9 — Typecheck separated from build

**Decision**: `npm run typecheck` runs `tsc --noEmit`. The build
command (`vite build`) does its own bundling but does not block on
type errors by default; CI runs typecheck as a separate gate.

**Rationale**:
- Vite's esbuild transpiler doesn't enforce TypeScript types — only
  strips them. A green build can hide type errors.
- A dedicated `typecheck` script ensures every PR is type-clean.

**Alternatives considered**:
- *Use `vite-plugin-checker`*: surfaces type errors at dev time but
  bloats dev startup. The dedicated script is simpler.

---

## Decision 10 — Constitution principle IV exempt list (this feature)

**Decision**: The following files in Feature 003 are exempt from the
"failing test first" rule per the constitution v1.1.0 exempt list
(≤5-line wrappers, config, generated code):

- `frontend/src/main.tsx` — 3-line createRoot bootstrap.
- `frontend/src/lib/utils.ts` — 1-line `cn(...inputs)` shadcn helper.
- `frontend/src/components/ui/*` — copy-pasted shadcn primitives
  (treated as generated boilerplate; we test the components that
  *use* them).
- `frontend/test/setup.ts` — Vitest setup file (test infrastructure
  itself).
- `frontend/eslint.config.js`, `vite.config.ts`, `tsconfig*.json` —
  config files.
- `frontend/index.html` — entry HTML.

Every other source file (components, hooks, api/client, route
components, the FastAPI server module) MUST have a failing test
authored before implementation.

**Rationale**:
- Constitution principle IV exempts "≤5-line entry-point wrappers
  that only call a `main()` function defined elsewhere" and config /
  generated code. The list above conforms.
- Documenting it here gives every task in tasks.md a clear answer to
  "does this need a test?"

**Alternatives considered**:
- *Test main.tsx*: technically possible but tests the bootstrap, not
  the application — no signal.
