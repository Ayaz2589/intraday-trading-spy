import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getSupabase } from '@/auth/supabase-client'

export const Route = createFileRoute('/sign-in/callback')({
  component: SignInCallback,
})

function SignInCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase puts tokens in URL fragment after a magic-link click.
    // supabase-js with detectSessionInUrl:true processes this automatically;
    // we just wait briefly for the session to land then route to /runs.
    const supabase = getSupabase()
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        navigate({ to: '/runs' })
      } else {
        setError('Sign-in failed. Please try again.')
        setTimeout(() => navigate({ to: '/sign-in' }), 1500)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [navigate])

  return (
    <div className="max-w-md mx-auto mt-16 p-6 text-center">
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <p className="text-muted-foreground">Completing sign-in…</p>
      )}
    </div>
  )
}
