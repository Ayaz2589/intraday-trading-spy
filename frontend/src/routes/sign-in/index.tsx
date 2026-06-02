import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { AuthScreen } from '@/components/auth/AuthScreen'
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
      await auth.verifyOtp(email, code)
      navigate({ to: next ?? '/runs' })
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthScreen title="Sign in" testId="signin-page">
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
    </AuthScreen>
  )
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
