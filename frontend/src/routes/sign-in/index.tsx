import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'

type SearchParams = { next?: string }

export const Route = createFileRoute('/sign-in/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    next: typeof search.next === 'string' ? search.next : undefined,
  }),
  component: SignInPage,
})

function SignInPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { next } = Route.useSearch()
  const [stage, setStage] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await auth.signInWithOtp(email)
      setStage('otp')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await auth.verifyOtp(email, otp)
      if (result.requiresMfa) {
        navigate({ to: '/sign-in/mfa', search: { next: next ?? '/runs' } })
      } else {
        navigate({ to: next ?? '/runs' })
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6 border rounded-lg">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      {stage === 'email' && (
        <form onSubmit={sendCode}>
          <p className="text-sm text-muted-foreground mb-4">
            Enter your email — we'll send a 6-digit code.
          </p>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full p-2 border rounded mb-2"
          />
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <button
            type="submit"
            disabled={!email || busy}
            className="w-full p-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send sign-in code'}
          </button>
        </form>
      )}
      {stage === 'otp' && (
        <form onSubmit={submitCode}>
          <p className="text-sm text-muted-foreground mb-4">
            Check your inbox at <strong>{email}</strong> for a 6-digit code.
          </p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            value={otp}
            onChange={e => setOtp(e.target.value)}
            required
            className="w-full p-2 border rounded mb-2"
          />
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <button
            type="submit"
            disabled={otp.length < 6 || busy}
            className="w-full p-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Verify code'}
          </button>
          <button
            type="button"
            onClick={() => setStage('email')}
            className="w-full p-2 mt-2 text-sm text-muted-foreground"
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  )
}
