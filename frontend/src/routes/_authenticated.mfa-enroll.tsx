import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'

export const Route = createFileRoute('/_authenticated/mfa-enroll')({
  component: MfaEnrollPage,
})

function MfaEnrollPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [enrollment, setEnrollment] = useState<{
    factorId: string
    qrCodeUrl: string
    secret: string
  } | null>(null)
  const [code, setCode] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    auth
      .enrollMfa()
      .then(result => setEnrollment(result))
      .catch(err => setError(String(err)))
  }, [auth])

  const onConfirm = async () => {
    if (!enrollment) return
    setBusy(true)
    setError(null)
    try {
      await auth.confirmMfaEnrollment(enrollment.factorId, code)
      navigate({ to: '/runs' })
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!enrollment) {
    return <div className="p-8">Setting up second-factor authentication…</div>
  }

  return (
    <div className="max-w-md mx-auto mt-16 p-6 border rounded-lg">
      <h1 className="text-xl font-semibold mb-4">Set up multi-factor authentication</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Scan this QR with your authenticator app (Google Authenticator, 1Password, etc.).
      </p>
      <img src={enrollment.qrCodeUrl} alt="MFA QR code" className="border rounded mb-4" />
      <p className="text-xs text-muted-foreground mb-1">Or type this secret manually:</p>
      <code className="block p-2 bg-muted rounded text-xs break-all mb-4">{enrollment.secret}</code>
      <label className="flex items-start gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm">I've saved my backup codes</span>
      </label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="6-digit code from app"
        value={code}
        onChange={e => setCode(e.target.value)}
        className="w-full p-2 border rounded mb-2"
      />
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <button
        onClick={onConfirm}
        disabled={!acknowledged || code.length < 6 || busy}
        className="w-full p-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {busy ? 'Confirming…' : 'Confirm enrollment'}
      </button>
    </div>
  )
}
