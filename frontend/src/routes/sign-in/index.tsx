import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { SignInForm } from '@/components/auth/SignInForm'
import { OtpCodeForm } from '@/components/auth/OtpCodeForm'

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
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sendCode = async (input: string) => {
    setEmail(input)
    setBusy(true)
    setError(null)
    try {
      await auth.signInWithOtp(input)
      setStage('otp')
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await auth.verifyOtp(email, code)
      if (result.requiresMfa) {
        navigate({ to: '/sign-in/mfa', search: { next: next ?? '/runs' } })
      } else {
        navigate({ to: next ?? '/runs' })
      }
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6 border rounded-lg" data-testid="signin-page">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      {stage === 'email' && (
        <SignInForm onSubmit={sendCode} pending={busy} error={error} initialEmail={email} />
      )}
      {stage === 'otp' && (
        <OtpCodeForm
          email={email}
          onSubmit={submitCode}
          pending={busy}
          error={error}
          onUseDifferentEmail={() => {
            setStage('email')
            setError(null)
          }}
        />
      )}
    </div>
  )
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
