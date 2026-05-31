# Contract: Data Fetching Layer

How the UI talks to the backend. Authoritative for `frontend/src/api/*` and `frontend/src/hooks/*`.

## Boundary

- **`@supabase/supabase-js`** — auth ONLY (sign-in, MFA, refresh, cross-tab events). No direct DB queries.
- **FastAPI** (Feature 006) — every read AND mutation goes through `frontend/src/api/client.ts`. Cursor pagination, error mapping, JWT attachment all centralized.

## `frontend/src/api/client.ts`

```typescript
type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  searchParams?: Record<string, string | number | boolean | undefined>
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const session = await getCurrentSession() // wraps supabase.auth.getSession with refresh-retry
  if (!session) throw new SessionExpiredError('no session')

  const url = new URL(path, import.meta.env.VITE_API_BASE_URL)
  if (options.searchParams) {
    for (const [k, v] of Object.entries(options.searchParams)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 401) {
    // Trigger refresh-retry; on success, retry the request ONCE
    await refreshSessionWithRetry()
    return apiRequest<T>(path, options) // recursive single retry
  }
  if (response.status === 404) throw new NotFoundError(path)
  if (response.status === 422) throw new ValidationError(await response.json())
  if (response.status === 429) throw new RateLimitedError(await response.json())
  if (response.status === 503) throw new ServiceUnavailableError(await response.json())
  if (!response.ok) throw new ApiError(response.status, await response.text())

  return response.json() as Promise<T>
}
```

## Per-resource modules

### `frontend/src/api/runs.ts`

```typescript
export async function listRuns(opts: { limit?: number; cursor?: string }): Promise<RunListResponse>
export async function getRun(runId: UUID): Promise<RunView>
export async function getRunStatus(runId: UUID): Promise<RunStatusResponse>
export async function listTrades(runId: UUID, opts: { limit?: number; cursor?: string }): Promise<TradeListResponse>
export async function listSignals(runId: UUID, opts: { executed?: boolean; limit?: number; cursor?: string }): Promise<SignalListResponse>
export async function listJournal(runId: UUID, opts: { limit?: number; cursor?: string }): Promise<JournalListResponse>
```

### `frontend/src/api/backtests.ts`

```typescript
export async function startBacktest(opts: { config_name: string; data_csv_path?: string }): Promise<StartBacktestResponse>
```

### `frontend/src/api/strategies.ts`

```typescript
export async function listStrategies(): Promise<StrategyListResponse>
```

### `frontend/src/api/data-downloads.ts`

```typescript
export async function startDataDownload(opts: { start_date: string; end_date: string }): Promise<StartDataDownloadResponse>
export async function getDataDownloadJob(jobId: UUID): Promise<DataDownloadJobView>
```

### `frontend/src/api/health.ts`

```typescript
// NOT through apiRequest — no auth needed
export async function getHealth(): Promise<HealthResponse>
```

All response types are Zod-validated at the wrapper level. Schema drift surfaces as a typed validation error in development.

## Hooks (`frontend/src/hooks/*.ts`)

```typescript
// Adaptive polling helper used by useRun, useRunStatus, useDataDownloadJob
function adaptivePollingInterval(query): number | false {
  const status = query.state.data?.status
  if (status === 'queued' || status === 'running') return 1000
  if (status === 'finished' || status === 'failed') return 30000
  return false
}

export function useRuns(opts: { limit?: number; cursor?: string }) {
  return useQuery({
    queryKey: ['runs', opts],
    queryFn: () => listRuns(opts),
    refetchInterval: 5000, // static — list refresh
  })
}

export function useRunStatus(runId: UUID) {
  return useQuery({
    queryKey: ['runStatus', runId],
    queryFn: () => getRunStatus(runId),
    refetchInterval: adaptivePollingInterval, // Q1
  })
}

export function useStartBacktest() {
  const queryClient = useQueryClient()
  const tracker = useActiveRunsTracker()
  return useMutation({
    mutationFn: startBacktest,
    onSuccess: (response) => {
      tracker.track(response.run_id) // Q2
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}
```

## Active runs tracker (Q2)

`frontend/src/lib/active-runs-tracker.ts` exposes a `useActiveRunsTracker()` hook + a top-level `useBackgroundPolling()` hook that, when mounted under `_authenticated.tsx`, creates a separate `useRunStatus(runId)` query per tracked run. TanStack Query's `refetchInterval` keeps each polling at the adaptive cadence. On terminal state, the tracker fires a toast notification AND `untrack`s the run.

## Pagination

Every list hook accepts `{ limit, cursor }`. The `next_cursor` from the response is the opaque base64 token from Feature 006 (cursor pagination contract). The hooks return it as part of the page metadata; the route stores it in the URL search params for deep linking.

For "infinite scroll" UX, components use `useInfiniteQuery`:

```typescript
const query = useInfiniteQuery({
  queryKey: ['runs'],
  queryFn: ({ pageParam }) => listRuns({ cursor: pageParam, limit: 20 }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
})
```

## Error handling matrix

| Backend response | Typed error class | UI behavior |
|---|---|---|
| 200/202 | (none — happy path) | Render data / show success state |
| 400 (invalid body / cursor) | `ValidationError` | Inline error message in form |
| 401 (missing or invalid token) | (intercepted) → refresh-retry → if exhausted, `SessionExpiredError` → `/sign-in?next=<current>` |
| 404 (not found / cross-user) | `NotFoundError` | "Resource not found" view; routes back to list |
| 422 (Pydantic validation) | `ValidationError` | Inline error message |
| 429 (concurrent-run cap) | `RateLimitedError` | Toast: "You have 5 active runs; wait for one to finish" |
| 5xx / network down | `ApiError` / `NetworkError` | Toast + connection-status indicator turns red (FR-013) |
| 503 (db_unreachable) | `ServiceUnavailableError` | Toast: "Backend is reaching the database" + status indicator red |

## Test obligations

- Every `frontend/src/api/*.ts` module has a matching `*.test.ts` with msw handlers asserting the exact request shape (method, path, headers, body, search params).
- Every `frontend/src/hooks/*.ts` has a matching test using `@testing-library/react` to render a consumer and assert the polling/refetch behavior.
- The adaptive polling function `adaptivePollingInterval` is unit-tested with each lifecycle state.
- The active-runs tracker is unit-tested for capacity (3-cap), eviction, terminal-state cleanup, and toast firing.
