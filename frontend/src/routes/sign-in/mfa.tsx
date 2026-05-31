import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'

type SearchParams = { next?: string }

export const Route = createFileRoute('/sign-in/mfa')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    next: typeof search.next === 'string' ? search.next : undefined,
  }),
  component: MfaChallengePage,
})

function MfaChallengePage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { next } = Route.useSearch()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    auth.getMfaState().then(state => {
      if (state.factors.length === 0) {
        navigate({ to: '/mfa-enroll' })
        return
      }
      setFactorId(state.factors[0].id)
    })
  }, [auth, navigate])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId) return
    setBusy(true)
    setError(null)
    try {
      await auth.challengeMfa(factorId, code)
      navigate({ to: next ?? '/runs' })
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!factorId) return <div className="p-8">Loading…</div>

  return (
    <form onSubmit={submit} className="max-w-md mx-auto mt-16 p-6 border rounded-lg">
      <h1 className="text-xl font-semibold mb-4">Two-factor code</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Enter the 6-digit code from your authenticator app.
      </p>
      <input
        type="text"
        inputMode="numeric"
        placeholder="123456"
        value={code}
        onChange={e => setCode(e.target.value)}
        required
        className="w-full p-2 border rounded mb-2"
      />
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <button
        type="submit"
        disabled={code.length < 6 || busy}
        className="w-full p-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {busy ? 'Verifying…' : 'Verify'}
      </button>
    </form>
  )
}
