import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getSupabase } from '@/auth/supabase-client'
import { AuthenticatedTopbar } from '@/components/authenticated-topbar'
import { SideNav } from '@/components/side-nav'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const supabase = getSupabase()
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      throw redirect({ to: '/sign-in', search: { next: location.href } })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <div
      style={{
        // App shell pinned to viewport — topbar + side nav don't scroll
        // with main. Only the <main> region scrolls (overflow: auto).
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <AuthenticatedTopbar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <SideNav />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
