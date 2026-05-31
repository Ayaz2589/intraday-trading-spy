import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { MfaChallenge } from '@/components/auth/MfaChallenge'

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

  const onSubmit = async (code: string) => {
    if (!factorId) return
    setBusy(true)
    setError(null)
    try {
      await auth.challengeMfa(factorId, code)
      navigate({ to: next ?? '/runs' })
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!factorId) {
    return (
      <div className="p-8" data-testid="mfa-challenge-loading">
        Loading…
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6 border rounded-lg" data-testid="mfa-challenge-page">
      <h1 className="text-xl font-semibold mb-4">Two-factor code</h1>
      <MfaChallenge onSubmit={onSubmit} pending={busy} error={error} />
    </div>
  )
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
