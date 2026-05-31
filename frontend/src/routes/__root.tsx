import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/auth/AuthProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function RootShell() {
  const navigate = useNavigate()
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider onCrossTabSignOut={() => navigate({ to: '/sign-in' })}>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export const Route = createRootRoute({
  component: RootShell,
})
