import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getSupabase } from '@/auth/supabase-client'

async function getAuthState() {
  const supabase = getSupabase()
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return { signedIn: false as const }
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const factors = await supabase.auth.mfa.listFactors()
  return {
    signedIn: true as const,
    currentLevel: aal.data?.currentLevel ?? null,
    nextLevel: aal.data?.nextLevel ?? null,
    hasFactor: (factors.data?.all ?? []).length > 0,
  }
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const state = await getAuthState()
    if (!state.signedIn) {
      throw redirect({ to: '/sign-in', search: { next: location.href } })
    }
    // If the user has a factor but is only aal1, route to MFA challenge.
    if (state.hasFactor && state.currentLevel === 'aal1' && state.nextLevel === 'aal2') {
      throw redirect({ to: '/sign-in/mfa', search: { next: location.href } })
    }
    // If no factor enrolled, force enrollment.
    if (!state.hasFactor) {
      // Avoid infinite redirect when already on mfa-enroll
      if (!location.pathname.startsWith('/mfa-enroll')) {
        throw redirect({ to: '/mfa-enroll' })
      }
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  )
}
