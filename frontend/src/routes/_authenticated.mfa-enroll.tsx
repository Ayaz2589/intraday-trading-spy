import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { MfaEnrollment, type MfaEnrollmentData } from '@/components/auth/MfaEnrollment'

export const Route = createFileRoute('/_authenticated/mfa-enroll')({
  component: MfaEnrollPage,
})

function MfaEnrollPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [enrollment, setEnrollment] = useState<MfaEnrollmentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    auth
      .enrollMfa()
      .then(result => setEnrollment(result))
      .catch(err => setError(toMessage(err)))
  }, [auth])

  const onConfirm = async (code: string) => {
    if (!enrollment) return
    setBusy(true)
    setError(null)
    try {
      await auth.confirmMfaEnrollment(enrollment.factorId, code)
      navigate({ to: '/runs' })
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!enrollment) {
    return (
      <div className="p-8" data-testid="mfa-enroll-loading">
        Setting up second-factor authentication…
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6 border rounded-lg" data-testid="mfa-enroll-page">
      <h1 className="text-xl font-semibold mb-4">Set up multi-factor authentication</h1>
      <MfaEnrollment
        enrollment={enrollment}
        onConfirm={onConfirm}
        pending={busy}
        error={error}
      />
    </div>
  )
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
