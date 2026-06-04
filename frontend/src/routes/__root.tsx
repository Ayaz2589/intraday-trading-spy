import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { AuthProvider } from '@/auth/AuthProvider'
import { shouldPersistQuery } from '@/lib/query-persist'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// Feature 013 perf: persist selected read-only snapshots (Data page) to
// localStorage so they paint instantly on reload, then refetch in the
// background (stale-while-revalidate). `shouldPersistQuery` scopes what is
// stored; `buster` invalidates old snapshots when the shape changes.
const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'intraday-trade-spy-query-cache',
})

const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000 // snapshots older than a day are discarded

function RootShell() {
  const navigate = useNavigate()
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE_MS,
        buster: 'bars-v1',
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <AuthProvider onCrossTabSignOut={() => navigate({ to: '/sign-in' })}>
        <Outlet />
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}

export const Route = createRootRoute({
  component: RootShell,
})
