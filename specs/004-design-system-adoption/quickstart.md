# Quickstart: Design System Adoption

**Plan**: [plan.md](./plan.md)

How to develop and preview this feature locally, and how to verify the
acceptance criteria against the running app.

---

## Prerequisites

- Node 20+ (the project's existing requirement; no change).
- A local Python venv for the backend if you want to run new backtests
  during testing. Otherwise, the existing runs in
  `backend/data/backtests/` are enough.

---

## Run the frontend in dev mode

```bash
cd frontend
npm install              # only on first checkout or if package.json changed
npm run dev
```

Open <http://localhost:5173/> (Vite default). The app loads against the
existing backend API.

## Run the backend (optional)

The frontend reads from existing run artifacts; only run the backend if you
need fresh runs.

```bash
cd backend
source .venv/bin/activate
python -m intraday_trade_spy.api.app   # or whatever the existing entry is
```

---

## Develop the feature

This feature is implemented in `frontend/src/` only. Follow the TDD-first
workflow per the Constitution (Principle IV):

1. **Read the spec and plan** before writing any code.
2. **For each new component or pure function**: write the failing test
   FIRST (`*.test.tsx` / `*.test.ts`), then the implementation, then
   refactor.
3. **For each restyled existing component**: audit its existing tests for
   class-name dependencies (per research R10), convert them to semantic
   queries, then restyle.
4. **Run the test suite after every change**:

   ```bash
   cd frontend
   npm test          # vitest run (one-shot)
   # or
   npm run test:watch
   ```

5. **Type-check before committing**:

   ```bash
   npm run typecheck
   ```

---

## Verify acceptance scenarios

### Story 1 — Cohesive visual reskin

| Acceptance check | How to verify |
|---|---|
| Dark theme tokens match handoff | Open devtools → Elements → `<html data-theme="dark">` → Computed → check `--bg-app: #0a0d15`, `--accent: #2563eb`, etc. |
| Light theme parity | Toggle theme → repeat the computed-style check; values should match `tokens.md` light column |
| Theme flip is flicker-free | Record screen during a flip; confirm no element interpolates color/background |
| HelpTooltip content preserved | Hover any `?` info-dot; verify the What / Why / How copy matches the pre-redesign content |
| Expanded trade row | Click a row in the trades table; verify 3-column layout (Indicator snapshot / Planned trade / Outcome) + full-width reason; left accent rail visible |
| Entry/exit dot rationale popovers | Click a dot on the VWAP line; verify popover surface uses new tokens; content unchanged |
| Routing preserved | Navigate to `/runs/<known-id>`; verify run data loads with restyled shell |
| Responsive at ≤1180px | Resize browser; Config + Summary cards collapse to a row of two, Rejections spans below |
| Responsive at ≤860px | Resize browser; sidebar hides; single-column stack |

### Story 2 — Layout variants

| Acceptance check | How to verify |
|---|---|
| Default layout is Overview | First load (no localStorage) shows stat row above chart |
| Click "Chart focus" | Chart moves above stat row; stat row becomes 3 equal columns |
| Layout persists | Click "Chart focus", reload page; layout is still focus |
| Active state visible | Segmented control's active option has raised surface styling |
| Keyboard accessibility | Tab to control, press right-arrow, then space; layout changes |

### Story 3 — Toast + Show rejections

| Acceptance check | How to verify |
|---|---|
| Toast on New Backtest | Click "New backtest"; toast appears bottom-center within ~200ms |
| Toast on Preset run | Open Presets → click any preset; toast names the preset |
| Toast on Customize run | Open Customize → change a value → "Run with these settings"; toast appears |
| Toast auto-dismisses | Toast disappears within ~2.5s of trigger |
| Rapid triggers | Click "New backtest" twice quickly; only one toast visible, latest message wins |
| Show rejections (chart) | Click "Show rejections" in chart header; grey tags appear above rejected bars |
| Show rejections (card) | Click "Show on chart" in Rejections card; same overlay appears; both buttons reflect on state |
| Cluster collapse | On a session with 99 consecutive same-reason rejections, verify only one tag with `Rej · ×N` is rendered at the cluster's first bar |
| Hover reveals timestamps | Hover a cluster tag; tooltip shows all member timestamps |
| Cluster boundary | If a session has 2 rejections of reason A, then 1 of reason B, then 2 more of A in consecutive bars, verify 3 separate tags |

---

## Verify success criteria

| Criterion | How to verify |
|---|---|
| SC-001 (30s to identify/run) | Sit a new user in front of the page; observe |
| SC-002 (tokens match) | Run `tokens.test.ts` which reads computed style and compares to the contract |
| SC-003 (theme < 200ms) | Performance tab → record a flip → measure `data-theme` mutation → next paint |
| SC-004 (100% tooltips reachable) | `git grep -l "HelpTooltip"` in `frontend/src/` → manually exercise each |
| SC-005 (WCAG AA) | Run [axe DevTools](https://www.deque.com/axe/devtools/) on dark and light pages; zero contrast violations on body text |
| SC-006 (existing tests pass) | `npm test` → 100% pass, no skipped tests |
| SC-007 (routes resolve) | Bookmark 3 run URLs before redesign; verify they load after |
| SC-008 (layout < 300ms) | Performance tab → record a layout flip → measure |
| SC-009 (toast < 200ms, < 2.5s) | Performance tab + console.time around fireToast |
| SC-010 (Show rejections = all rejection rows) | For a known run, count `journal.csv` rows with `status=rejected`; compute expected cluster count; verify rendered tag count matches |
| SC-011 (skeleton < 100ms, no CLS) | Throttle network (Slow 3G) → cold-load → verify skeletons appear immediately and stay; no CLS in Lighthouse |
| SC-012 (CSV-missing graceful) | Move a run's source CSV aside; reload → chart shows ErrorCard, rest of page works |

---

## Production build sanity

```bash
cd frontend
npm run build
npm run preview          # open the preview URL and re-run the verification checks above
```

---

## Rollback

This feature is a frontend-only restyle; rollback is trivial:

```bash
git revert <merge-sha>     # if merged
# or
git checkout main          # if not yet merged
```

No database migrations, no API changes, no config edits — nothing to undo
outside the `frontend/` tree.
