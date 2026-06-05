# /runs Shows All Backtests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/runs` the chronological index of every backtest (study children included) with per-row origin badges, and remove the cloud-stack individual-backtest creation path.

**Architecture:** Drop the feature-014 `study_id IS NULL` filter in `list_runs`, enrich each row with `study_kind` via a PostgREST FK embed flattened server-side, surface it in a new `RunOriginBadge` in the runs list. Then delete the (already unmounted) backtest-creation UI and the `POST /api/backtests` endpoint plus its now-orphaned lifecycle helpers. Cursor pagination and the React Query "Load more" pattern stay untouched.

**Tech Stack:** FastAPI + Pydantic v2 + supabase-py (backend), React + TypeScript + TanStack Router + React Query + Vitest (frontend), pytest.

**Spec:** `docs/superpowers/specs/2026-06-05-runs-show-all-backtests-design.md`
**Branch:** `feat/runs-show-all-backtests` (already created; design doc committed). Push to GitHub at the end (Task 9).

**Test commands:**
- Backend single file: `cd backend && .venv/bin/pytest tests/path/test_x.py -v`
- Backend full offline suite: `make test` (from repo root)
- Backend lint: `make lint`
- Frontend single file: `cd frontend && npx vitest run src/path/file.test.tsx`
- Frontend full suite: `cd frontend && npm test`

**Pre-verified facts (don't re-litigate, but the greps to re-confirm are in Task 6):**
- `validation_lifecycle.py:528` imports `materialize_bars_csv` from `lifecycle.py` — it MUST survive the removal.
- `ConcurrentRunCapExceeded` is imported by `routers/data.py:12` and `routers/bars.py` — it MUST survive.
- `_today_et` is used by the backfill path (`lifecycle.py:637`) — it MUST survive.
- `_reserve_slot` / `_release_slot` / `_active_runs` / `_active_runs_lock` / `_get_max_concurrent_runs` / `DEFAULT_MAX_CONCURRENT_RUNS_PER_USER` / `ConfigNotFoundError` / the `compute_spec_hash` import are used ONLY by `start_backtest` / `_run_backtest_task` / `routers/backtests.py` — they all go.
- `activeRunsTracker` (`frontend/src/lib/active-runs-tracker.ts`) is imported only by `useStartBacktest` — it goes.
- `RunsEmptyState.tsx` ("Run your first backtest" CTA) is imported by nothing but its own test — it goes.
- The DB `segment` CHECK allows only `train|validation|lockbox|NULL` (`train_validation` maps to NULL at persist), so the existing Literals are correct.
- Runs route paths: list page `frontend/src/routes/_authenticated.runs.tsx`; study detail route is `/validation/$studyId`.

---

### Task 1: Backend storage — `list_runs` returns ALL runs with `study_kind`

**Files:**
- Modify: `backend/src/intraday_trade_spy/storage/client.py:578-616` (`list_runs`)
- Rename + rewrite: `backend/tests/storage/test_list_runs_filter.py` → `backend/tests/storage/test_list_runs.py`

- [ ] **Step 1: Rename the test file**

```bash
git mv backend/tests/storage/test_list_runs_filter.py backend/tests/storage/test_list_runs.py
```

- [ ] **Step 2: Rewrite the test file with the new expectations**

Replace the entire contents of `backend/tests/storage/test_list_runs.py` with:

```python
"""list_runs lists EVERY run — study children included.

Supersedes 014's FR-008 (study_id IS NULL filter): individual backtest
creation is gone, so /runs is the chronological index of all backtests.
Origin badges distinguish study children; each row carries `study_kind`
flattened from the validation_studies FK embed.
"""

from unittest import mock
from uuid import uuid4

from intraday_trade_spy.storage.client import SupabaseStorageClient


def _client_with_query_recorder(rows=None):
    """A SupabaseStorageClient over a chain-recording fake supabase client."""
    calls = []

    class _Query:
        def _record(self, name, *args):
            calls.append((name, args))
            return self

        def select(self, *a):
            return self._record("select", *a)

        def eq(self, *a):
            return self._record("eq", *a)

        def is_(self, *a):
            return self._record("is_", *a)

        def order(self, *a, **kw):
            return self._record("order", *a)

        def limit(self, *a):
            return self._record("limit", *a)

        def lt(self, *a):
            return self._record("lt", *a)

        def execute(self):
            calls.append(("execute", ()))
            resp = mock.MagicMock()
            resp.data = list(rows or [])
            return resp

    fake = mock.MagicMock()
    fake.table.return_value = _Query()

    with mock.patch("intraday_trade_spy.storage.client.create_client", return_value=fake):
        client = SupabaseStorageClient(
            url="https://test.supabase.co",
            service_role_key="fake-key",
            user_id=str(uuid4()),
        )
    return client, calls


def test_list_runs_does_not_hide_study_children():
    client, calls = _client_with_query_recorder()

    client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    assert not any(name == "is_" for name, _ in calls), (
        f"014's study_id IS NULL filter must be gone; recorded query: {calls}"
    )


def test_list_runs_embeds_study_kind():
    client, calls = _client_with_query_recorder()

    client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    assert ("select", ("*, validation_studies(kind)",)) in calls, (
        f"expected FK embed select; recorded query: {calls}"
    )


def test_list_runs_flattens_embed_to_study_kind():
    child = {
        "id": "r1",
        "started_at": "2026-06-04T14:11:00+00:00",
        "validation_studies": {"kind": "walk_forward"},
    }
    standalone = {
        "id": "r2",
        "started_at": "2026-06-03T09:02:00+00:00",
        "validation_studies": None,
    }
    client, _ = _client_with_query_recorder(rows=[child, standalone])

    page = client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    assert page.runs[0]["study_kind"] == "walk_forward"
    assert page.runs[1]["study_kind"] is None
    assert "validation_studies" not in page.runs[0], "embed must be flattened away"


def test_list_runs_keeps_existing_ordering_and_pagination():
    client, calls = _client_with_query_recorder()

    client.list_runs(user_id=client.user_id, limit=20, cursor=None)

    names = [c[0] for c in calls]
    assert names.index("order") < names.index("execute")
    assert ("limit", (21,)) in calls  # limit+1 page probe unchanged
```

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `cd backend && .venv/bin/pytest tests/storage/test_list_runs.py -v`
Expected: `test_list_runs_does_not_hide_study_children`, `test_list_runs_embeds_study_kind`, `test_list_runs_flattens_embed_to_study_kind` FAIL (filter still applied, select is `*`, no flatten). `test_list_runs_keeps_existing_ordering_and_pagination` PASSES.

- [ ] **Step 4: Implement — rewrite `list_runs` in `client.py`**

Replace the `list_runs` method (currently lines 578-616) with:

```python
    def list_runs(self, *, user_id, limit: int, cursor: str | None):
        """List a user's runs newest-first — EVERY run, study children included.

        014 hid children behind a study_id IS NULL filter; since individual
        backtest creation was removed, /runs is now the chronological index
        of all backtests, with origin badges distinguishing study children.
        Each row carries `study_kind` flattened from the validation_studies
        FK embed (None for standalone rows or children whose study was
        deleted). Returns ListPage(runs, next_cursor).
        """
        from intraday_trade_spy.api.pagination import decode_cursor, encode_cursor

        q = (
            self._client.table("runs")
            # FK embed (runs.study_id → validation_studies.id): one query
            # gets each child's study kind for the origin badge.
            .select("*, validation_studies(kind)")
            .eq("user_id", str(user_id))
            .order("started_at", desc=True)
            .order("id", desc=True)
            .limit(limit + 1)
        )
        decoded = decode_cursor(cursor)
        if decoded is not None:
            started_at_str, id_str = decoded
            # Naive cursor scan: filter for rows strictly older than the boundary.
            q = q.lt("started_at", started_at_str)
        try:
            response = q.execute()
        except Exception as exc:
            raise CloudPushError(f"list_runs failed: {exc}") from exc

        rows = response.data or []
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            last = rows[-1]
            next_cursor = encode_cursor(last["started_at"], last["id"])

        for row in rows:
            embed = row.pop("validation_studies", None)
            row["study_kind"] = (embed or {}).get("kind")

        class _Page:
            pass
        page = _Page()
        page.runs = rows
        page.next_cursor = next_cursor
        return page
```

- [ ] **Step 5: Run the tests to verify all pass**

Run: `cd backend && .venv/bin/pytest tests/storage/test_list_runs.py -v`
Expected: 4 PASS.

- [ ] **Step 6: Run the wider storage + API tests for regressions**

Run: `cd backend && .venv/bin/pytest tests/storage tests/api/new -q -m "not slow and not integration"`
Expected: all pass. (`RunView` has `extra="ignore"`, so the new `study_kind` key in rows is harmless until Task 2 declares it.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/intraday_trade_spy/storage/client.py backend/tests/storage/test_list_runs.py
git commit -m "feat(runs): list_runs returns all runs incl. study children w/ study_kind embed"
```

---

### Task 2: Backend API — `RunView.study_kind` passthrough

**Files:**
- Modify: `backend/src/intraday_trade_spy/api/schemas.py:120-138` (`RunView`)
- Test: `backend/tests/api/new/test_runs_endpoints.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/api/new/test_runs_endpoints.py`:

```python
def test_list_runs_includes_study_kind(unit_client, stub_storage_client):
    """Origin badge data: study children carry study_kind from the FK embed."""
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    class _Page:
        next_cursor = None
    page = _Page()
    row = _make_run_row(uuid4(), TEST_USER_ID)
    row["study_id"] = str(uuid4())
    row["segment"] = "validation"
    row["window_index"] = 3
    row["study_kind"] = "walk_forward"
    page.runs = [row]
    stub_storage_client.list_runs.return_value = page

    r = unit_client.get("/api/runs")
    assert r.status_code == 200
    run = r.json()["runs"][0]
    assert run["study_kind"] == "walk_forward"
    assert run["segment"] == "validation"
    assert run["window_index"] == 3


def test_list_runs_study_kind_null_for_standalone(unit_client, stub_storage_client):
    from uuid import UUID
    TEST_USER_ID = UUID("11111111-1111-1111-1111-111111111111")

    class _Page:
        next_cursor = None
    page = _Page()
    page.runs = [_make_run_row(uuid4(), TEST_USER_ID)]
    stub_storage_client.list_runs.return_value = page

    r = unit_client.get("/api/runs")
    assert r.status_code == 200
    assert r.json()["runs"][0]["study_kind"] is None
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/api/new/test_runs_endpoints.py -v -k study_kind`
Expected: FAIL — `KeyError: 'study_kind'` (field not declared on `RunView`, `extra="ignore"` drops it).

- [ ] **Step 3: Add the field to `RunView`**

In `backend/src/intraday_trade_spy/api/schemas.py`, after `window_index: Optional[int] = None` (line 138), add:

```python
    # /runs origin badge: study kind flattened from the validation_studies FK
    # embed by storage list_runs. None for standalone rows, children whose
    # study was deleted, and the detail endpoint (which doesn't embed — the
    # detail badge only needs study_id/segment/window).
    study_kind: Optional[Literal["walk_forward", "sensitivity"]] = None
```

- [ ] **Step 4: Run to verify pass + no regressions**

Run: `cd backend && .venv/bin/pytest tests/api/new -q -m "not slow and not integration"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/intraday_trade_spy/api/schemas.py backend/tests/api/new/test_runs_endpoints.py
git commit -m "feat(api): RunView.study_kind for runs-list origin badges"
```

---

### Task 3: Frontend — `Run.study_kind` type + `RunOriginBadge` component

**Files:**
- Modify: `frontend/src/api/types.ts:52-54` (Run type)
- Create: `frontend/src/components/runs/RunOriginBadge.tsx`
- Test: `frontend/src/components/runs/RunOriginBadge.test.tsx`

- [ ] **Step 1: Add `study_kind` to the `Run` type**

In `frontend/src/api/types.ts`, after `window_index?: number | null` (line 54), add:

```typescript
  // /runs origin badge: study kind flattened server-side from the
  // validation_studies FK embed. Null/absent for standalone (CLI) runs.
  study_kind?: 'walk_forward' | 'sensitivity' | null
```

- [ ] **Step 2: Write the failing component test**

Create `frontend/src/components/runs/RunOriginBadge.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Run } from '@/api/types'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

const baseRun: Run = {
  id: 'r1',
  started_at: '2026-06-04T14:11:00Z',
  finished_at: '2026-06-04T14:12:00Z',
  status: 'finished',
  range_start: '2026-01-01',
  range_end: '2026-03-31',
  bar_count: 78,
  summary: {
    pnl: '$120.50',
    win_rate: 0.6,
    sharpe: 1.5,
    max_drawdown: '$50.00',
    total_trades: 5,
    total_signals: 10,
    rejected_signals: 5,
  },
  data_fingerprint: 'fp',
  app_version: '0.1.0',
  is_favorite: false,
  failure_reason: null,
}

describe('<RunOriginBadge />', () => {
  beforeEach(() => navigateMock.mockClear())

  it('renders kind · segment · window for a walk-forward child', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's1',
      study_kind: 'walk_forward' as const,
      segment: 'validation' as const,
      window_index: 3,
    }
    render(<RunOriginBadge run={run} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('walk-forward · OOS · w3')
  })

  it('labels train segment as IS and omits a missing window (sensitivity)', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's2',
      study_kind: 'sensitivity' as const,
      segment: 'train' as const,
      window_index: null,
    }
    render(<RunOriginBadge run={run} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('sensitivity · IS')
  })

  it('omits a null segment (combined train+validation child)', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's3',
      study_kind: 'walk_forward' as const,
      segment: null,
      window_index: 4,
    }
    render(<RunOriginBadge run={run} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('walk-forward · w4')
  })

  it('still renders segment/window when the parent study was deleted (kind null)', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's4',
      study_kind: null,
      segment: 'train' as const,
      window_index: 3,
    }
    render(<RunOriginBadge run={run} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('IS · w3')
  })

  it('navigates to the study and suppresses the row link on click', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's5',
      study_kind: 'walk_forward' as const,
      segment: 'validation' as const,
      window_index: 0,
    }
    render(<RunOriginBadge run={run} />)
    fireEvent.click(screen.getByTestId('run-origin-badge'))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/validation/$studyId',
      params: { studyId: 's5' },
    })
  })

  it('renders a lockbox tag without a link', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = { ...baseRun, segment: 'lockbox' as const }
    render(<RunOriginBadge run={run} />)
    const badge = screen.getByTestId('run-origin-badge')
    expect(badge).toHaveTextContent('lockbox')
    expect(badge.tagName).not.toBe('BUTTON')
  })

  it('renders "CLI run" for a standalone run', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    render(<RunOriginBadge run={baseRun} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('CLI run')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/runs/RunOriginBadge.test.tsx`
Expected: FAIL — module `./RunOriginBadge` not found.

- [ ] **Step 4: Implement the component**

Create `frontend/src/components/runs/RunOriginBadge.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Run } from '@/api/types'

// /runs origin column: where did this backtest come from? Study children
// (walk-forward windows, sensitivity points) show kind · segment · window
// and jump to their study; lockbox one-shots show a plain tag; anything
// else was pushed from the CLI.

const KIND_LABEL: Record<string, string> = {
  walk_forward: 'walk-forward',
  sensitivity: 'sensitivity',
}

const SEGMENT_LABEL: Record<string, string> = {
  train: 'IS',
  validation: 'OOS',
  lockbox: 'lockbox',
}

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  width: 'fit-content',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--surface-2, #f6f7f9)',
  fontSize: 'var(--fs-xs, 11px)',
  color: 'var(--text-muted)',
}

export function RunOriginBadge({ run }: { run: Run }) {
  const navigate = useNavigate()

  if (run.study_id) {
    const studyId = run.study_id
    const parts: string[] = []
    if (run.study_kind) parts.push(KIND_LABEL[run.study_kind] ?? run.study_kind)
    if (run.segment) parts.push(SEGMENT_LABEL[run.segment] ?? run.segment)
    if (run.window_index != null) parts.push(`w${run.window_index}`)
    return (
      <button
        type="button"
        data-testid="run-origin-badge"
        title="Open the study that produced this run"
        onClick={e => {
          // The whole row is a Link to the run — same pattern as the
          // delete button: don't let the row navigation win.
          e.preventDefault()
          e.stopPropagation()
          navigate({ to: '/validation/$studyId', params: { studyId } })
        }}
        style={{ ...badgeStyle, cursor: 'pointer', color: 'var(--accent, #2563eb)' }}
      >
        {parts.join(' · ') || 'study'}
      </button>
    )
  }

  if (run.segment === 'lockbox') {
    return (
      <span data-testid="run-origin-badge" style={badgeStyle}>
        lockbox
      </span>
    )
  }

  return (
    <span
      data-testid="run-origin-badge"
      style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}
    >
      CLI run
    </span>
  )
}
```

- [ ] **Step 5: Run to verify all pass**

Run: `cd frontend && npx vitest run src/components/runs/RunOriginBadge.test.tsx`
Expected: 7 PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/runs/RunOriginBadge.tsx frontend/src/components/runs/RunOriginBadge.test.tsx
git commit -m "feat(runs-ui): RunOriginBadge — study kind/segment/window per run"
```

---

### Task 4: Frontend — Origin column in `RunRow` + `RunsList` header

**Files:**
- Modify: `frontend/src/components/runs/RunRow.tsx` (grid + badge)
- Modify: `frontend/src/components/runs/RunsList.tsx` (header grid + Origin header)
- Test: `frontend/src/components/runs/RunRow.test.tsx` (append + extend router mock)

- [ ] **Step 1: Extend the router mock and write the failing tests**

In `frontend/src/components/runs/RunRow.test.tsx`, replace the existing `vi.mock('@tanstack/react-router', ...)` block (lines 7-9) with:

```tsx
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}))
```

Append inside the `describe('<RunRow />', ...)` block:

```tsx
  it('shows the origin badge for a study child run', async () => {
    const { RunRow } = await import('./RunRow')
    const child = {
      ...baseRun,
      id: 'r3',
      study_id: 's1',
      study_kind: 'walk_forward' as const,
      segment: 'validation' as const,
      window_index: 9,
    }
    render(wrap(<RunRow run={child} />))
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('walk-forward · OOS · w9')
  })

  it('shows CLI run origin for a standalone run', async () => {
    const { RunRow } = await import('./RunRow')
    render(wrap(<RunRow run={baseRun} />))
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('CLI run')
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/runs/RunRow.test.tsx`
Expected: the two new tests FAIL (no `run-origin-badge` testid); the three existing tests PASS.

- [ ] **Step 3: Add the badge column to `RunRow`**

In `frontend/src/components/runs/RunRow.tsx`:

1. Add the import:
```tsx
import { RunOriginBadge } from './RunOriginBadge'
```
2. Change the `gridTemplateColumns` in the `<Link>` style (line 44) from `'1fr 120px 120px 120px 40px'` to `'1fr 170px 120px 120px 120px 40px'`.
3. Immediately after the first `<div>...</div>` cell (the Started/range/failure cell ending line 66), insert:
```tsx
        <RunOriginBadge run={run} />
```

- [ ] **Step 4: Add the matching header column to `RunsList`**

In `frontend/src/components/runs/RunsList.tsx`:

1. Change the header `gridTemplateColumns` (line 56) from `'1fr 120px 120px 120px 40px'` to `'1fr 170px 120px 120px 120px 40px'`.
2. After `<span>Started</span>` (line 67), insert:
```tsx
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Origin
          <HelpTooltip helpKey="child_run" />
        </span>
```

- [ ] **Step 5: Run to verify pass**

Run: `cd frontend && npx vitest run src/components/runs/RunRow.test.tsx`
Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/runs/RunRow.tsx frontend/src/components/runs/RunRow.test.tsx frontend/src/components/runs/RunsList.tsx
git commit -m "feat(runs-ui): Origin column in runs list w/ study badge"
```

---

### Task 5: Frontend — help copy reflects the new reality

**Files:**
- Modify: `frontend/src/components/help-content.ts` (`backtest_queue` line 178-182, `child_run` line 299-303)

(Help copy is content, not logic — the existing `help-content.test.ts` asserts key presence, not wording. No new test; TDD exempt as config/docs-like change.)

- [ ] **Step 1: Update `backtest_queue` copy**

The current copy says "When you click Start Backtest…" — that button no longer exists. Replace the `backtest_queue` entry (lines 178-182) with:

```typescript
  backtest_queue: {
    title: "Backtest queue",
    description:
      "Runs are created by validation studies (each evaluation is saved already-finished or failed) and by CLI pushes. A run's status moves queued → running → finished (or failed — `failure_reason` explains why). Refresh cadence speeds up while anything is active and slows down once it finishes.",
  },
```

- [ ] **Step 2: Update `child_run` copy**

The current copy ends "Child runs are hidden from the main runs list; you reach them through their study." — no longer true. Replace the `child_run` entry (lines 299-303) with:

```typescript
  child_run: {
    title: "Child run",
    description:
      "A real, saved backtest produced by one evaluation inside a validation study — one walk-forward window, one sensitivity grid point, or the lockbox one-shot. It has the same trades, journal, and chart as any standalone run, so you can see exactly WHY that slice performed the way it did. Child runs appear in the Backtests list with an origin badge (kind · IS/OOS · window) and are also reachable through their study.",
  },
```

- [ ] **Step 3: Run the help-content + tooltip tests**

Run: `cd frontend && npx vitest run src/components/help-content.test.ts src/components/help-tooltip.feature-007-coverage.test.tsx`
Expected: PASS (tests check keys, not copy).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/help-content.ts
git commit -m "docs(help): backtest_queue + child_run copy for the all-runs list"
```

---

### Task 6: Backend removal — `POST /api/backtests` and its machinery

**Files:**
- Test (new, failing first): `backend/tests/api/new/test_runs_endpoints.py` (append)
- Delete: `backend/src/intraday_trade_spy/api/routers/backtests.py`
- Delete: `backend/tests/api/new/test_backtests.py`
- Modify: `backend/src/intraday_trade_spy/api/app.py:17-26,134` (router import + registration)
- Modify: `backend/src/intraday_trade_spy/api/lifecycle.py` (delete `start_backtest` 289-368, `_run_backtest_task` 371-449, orphaned helpers)
- Modify: `backend/src/intraday_trade_spy/api/schemas.py` (delete `StartBacktestRequest` 35-64, `StartBacktestResponse` 83-85)
- Modify: `backend/tests/api/new/test_schemas.py` (delete the StartBacktestRequest tests, lines ~10-50)
- Modify: `backend/tests/api/integration/test_cross_user_isolation.py` (delete `test_user_a_cannot_see_user_b_config_via_backtests`, lines ~48-60)

- [ ] **Step 1: Write the failing endpoint-absence test**

Append to `backend/tests/api/new/test_runs_endpoints.py`:

```python
def test_backtest_creation_endpoint_removed(unit_client):
    """Individual backtests can no longer be created — runs come only from
    validation studies and CLI pushes."""
    r = unit_client.post("/api/backtests", json={"config_name": "default"})
    assert r.status_code == 404
```

Run: `cd backend && .venv/bin/pytest tests/api/new/test_runs_endpoints.py -v -k removed`
Expected: FAIL (endpoint exists → 202/422).

- [ ] **Step 2: Delete the router and its test file; deregister from the app**

```bash
git rm backend/src/intraday_trade_spy/api/routers/backtests.py
git rm backend/tests/api/new/test_backtests.py
```

In `backend/src/intraday_trade_spy/api/app.py`:
1. Remove `backtests,` from the `from intraday_trade_spy.api.routers import (...)` block (line 18).
2. Remove the line `app.include_router(backtests.router, prefix="/api")` (line 134).

- [ ] **Step 3: Remove the backtest machinery from `lifecycle.py`**

In `backend/src/intraday_trade_spy/api/lifecycle.py`, delete:
- `start_backtest` (lines 289-368) and `_run_backtest_task` (lines 371-449) — everything between `def start_backtest(` and the line before `def start_data_download(`.
- `ConfigNotFoundError` class (lines 49-50).
- `_reserve_slot` (60-66), `_release_slot` (68-73), `_get_max_concurrent_runs` (75-83).
- `_active_runs` / `_active_runs_lock` module globals (45-46).
- `DEFAULT_MAX_CONCURRENT_RUNS_PER_USER = 5` (line 36).
- The `from intraday_trade_spy.run_spec import compute_spec_hash` import (line 25).
- Update the module docstring (lines 1-8): replace with

```python
"""Data-download + backfill lifecycle orchestrator (Feature 006/009).

Owns the FastAPI BackgroundTask bodies for data downloads and bulk
backfills, the shared bars-CSV materializer used by the validation
engine, and the startup-time sweep that reaps stale `running` rows from
a prior process crash. (The individual-backtest task body was removed:
runs are created only by validation studies and CLI pushes.)

See contracts/background-tasks.md for the full contract.
"""
```

KEEP (verified still used): `ConcurrentRunCapExceeded` (data/bars routers), `materialize_bars_csv` + `_fetch_and_cache_range` (validation_lifecycle), `_today_et` (backfill, line 637), `_get_max_concurrent_downloads`, `BarsUnavailableError`, all download/backfill functions, `sweep_stale_runs` (app startup).

- [ ] **Step 4: Re-verify nothing references the deleted names, prune dead imports**

```bash
cd backend && grep -rn "start_backtest\|_run_backtest_task\|ConfigNotFoundError\|_reserve_slot\|_release_slot\|_get_max_concurrent_runs\|DEFAULT_MAX_CONCURRENT_RUNS_PER_USER\|_active_runs" src/
```
Expected: no output. (If `routers/__init__.py` re-exports `backtests`, remove that too.) Then:
```bash
cd backend && .venv/bin/ruff check src tests
```
Expected: clean — if ruff flags now-unused imports in `lifecycle.py` (e.g. `uuid4`, `BackgroundTasks`, `tempfile`), remove exactly those it names. Note `errors.raise_config_not_found` / `raise_concurrent_cap` in `api/errors.py` may become partially unused — leave `errors.py` alone unless ruff complains (other routers use them).

- [ ] **Step 5: Remove the schemas + their tests**

In `backend/src/intraday_trade_spy/api/schemas.py` delete `StartBacktestRequest` (lines 35-64) and `StartBacktestResponse` (lines 83-85).

In `backend/tests/api/new/test_schemas.py` delete every test importing `StartBacktestRequest` (currently: `test_start_backtest_request_requires_config_name`, `test_start_backtest_request_rejects_symbol`, `test_start_backtest_request_rejects_direction`, `test_start_backtest_request_rejects_live_auto_enabled`, `test_start_backtest_request_accepts_optional_data_csv_path`, and any other `StartBacktest*` test in the file).

In `backend/tests/api/integration/test_cross_user_isolation.py` delete the whole `test_user_a_cannot_see_user_b_config_via_backtests` function (lines ~48-60).

- [ ] **Step 6: Run the suite — absence test passes, no regressions**

Run: `cd backend && .venv/bin/pytest -q -m "not slow and not integration"`
Expected: all pass, including `test_backtest_creation_endpoint_removed`.

- [ ] **Step 7: Commit**

```bash
git add -A backend
git commit -m "feat(api)!: remove POST /api/backtests — runs come only from studies and CLI pushes"
```

---

### Task 7: Frontend removal — backtest-creation dead code

**Files:**
- Delete: `frontend/src/components/runs/StartBacktestDialog.tsx`
- Delete: `frontend/src/hooks/useStartBacktest.ts`, `frontend/src/hooks/useStartBacktest.test.ts`
- Delete: `frontend/src/api/backtests.ts`
- Delete: `frontend/src/lib/active-runs-tracker.ts`
- Delete: `frontend/src/components/runs/RunsEmptyState.tsx`, `frontend/src/components/runs/RunsEmptyState.test.tsx`
- Modify: `frontend/src/api/types.ts:159-165` (delete `StartBacktestRequest`/`StartBacktestResponse` types)
- Modify: `frontend/src/components/help-tooltip.feature-007-coverage.test.tsx` (drop dialog references)

(Deletions of dead code — the guard is the updated coverage test + full suite + grep, not new unit tests.)

- [ ] **Step 1: Delete the files**

```bash
git rm frontend/src/components/runs/StartBacktestDialog.tsx \
       frontend/src/hooks/useStartBacktest.ts \
       frontend/src/hooks/useStartBacktest.test.ts \
       frontend/src/api/backtests.ts \
       frontend/src/lib/active-runs-tracker.ts \
       frontend/src/components/runs/RunsEmptyState.tsx \
       frontend/src/components/runs/RunsEmptyState.test.tsx
```

- [ ] **Step 2: Delete the request/response types**

In `frontend/src/api/types.ts` delete (lines 159-165):

```typescript
export type StartBacktestRequest = {
  ...
}
export type StartBacktestResponse = { run_id: UUID; status: 'queued' }
```
(delete the whole `StartBacktestRequest` block and the `StartBacktestResponse` line; keep surrounding types.)

- [ ] **Step 3: Update the tooltip coverage test**

In `frontend/src/components/help-tooltip.feature-007-coverage.test.tsx`:
1. Delete the `vi.mock('@/hooks/useStartBacktest', ...)` block (lines 60-62).
2. Delete the import line `const { StartBacktestDialog } = await import('./runs/StartBacktestDialog')` (line 116).
3. Delete the render line `<StartBacktestDialog open onClose={() => {}} />` (line 130).
4. Change `<RunsList onStartBacktest={() => {}} />` (line 128) to `<RunsList />`.

Keep `'backtest_queue'` in `FEATURE_007_KEYS` — `RunsList` still renders that tooltip (empty state + Status header).

- [ ] **Step 4: Verify nothing references the deleted modules**

```bash
cd frontend && grep -rn "StartBacktest\|startBacktest\|active-runs-tracker\|activeRunsTracker\|RunsEmptyState" src/ ; echo "exit: $?"
```
Expected: no matches (exit 1). (`configure-run-menu`/`legacy-client` use the *legacy* `/api/backtests/run` path and different names — they are out of scope and must NOT match these patterns; if they appear, leave them.)

- [ ] **Step 5: Run the full frontend suite + typecheck**

```bash
cd frontend && npm run typecheck && npm test
```
Expected: typecheck clean, all tests pass (baseline before this change: 473 passing + 3 baseline-skips per CLAUDE.md 015 notes).

- [ ] **Step 6: Commit**

```bash
git add -A frontend
git commit -m "feat(runs-ui)!: remove individual-backtest creation UI dead code"
```

---

### Task 8: Full verification + design-doc cross-check

- [ ] **Step 1: Full backend suite**

Run: `make test`
Expected: all pass (586 baseline minus the ~10 deleted backtest-creation tests, plus the ~7 new ones).

- [ ] **Step 2: Backend lint**

Run: `make lint`
Expected: clean.

- [ ] **Step 3: Full frontend suite**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 4: Cross-check the design doc**

Re-read `docs/superpowers/specs/2026-06-05-runs-show-all-backtests-design.md` § Design 1-4 and § Error handling; confirm each bullet maps to shipped code/tests:
- all runs listed, newest-first, cursor pagination intact (Task 1)
- `study_kind` server-side enrichment (Tasks 1-2)
- origin badges incl. deleted-study fallback + lockbox + CLI (Tasks 3-4)
- educational copy (Task 5)
- creation path removed, legacy viewer untouched (Tasks 6-7)

- [ ] **Step 5: Commit any stragglers**

```bash
git status --short   # expect clean; commit anything intentional that remains
```

---

### Task 9: Push to GitHub

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/runs-show-all-backtests
```
Expected: branch visible on the GitHub remote.

- [ ] **Step 2: Report**

Tell the user the branch is pushed and offer (don't auto-create) a PR to `main`.
