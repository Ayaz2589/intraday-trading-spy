/**
 * AuthProvider — React context exposing the authenticated session +
 * sign-in/MFA/sign-out actions to the rest of the app.
 *
 * See specs/007-frontend-auth-api-migration/contracts/auth-flow.md.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from './supabase-client'
import { subscribeToCrossTabSignOut } from './cross-tab'

export type EnrollMfaResult = {
  factorId: string
  qrCodeUrl: string
  secret: string
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  isLoading: boolean
  signInWithOtp(email: string): Promise<{ sent: true }>
  verifyOtp(email: string, token: string): Promise<{ requiresMfa: boolean }>
  enrollMfa(): Promise<EnrollMfaResult>
  confirmMfaEnrollment(factorId: string, code: string): Promise<void>
  challengeMfa(factorId: string, code: string): Promise<void>
  signOut(): Promise<void>
  /** Returns the current authenticator-assurance-level state. */
  getMfaState(): Promise<{ currentLevel: string | null; nextLevel: string | null; factors: { id: string }[] }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}

type Props = {
  children: ReactNode
  /** Called when a cross-tab SIGNED_OUT event arrives. Typically a router navigation. */
  onCrossTabSignOut?: () => void
}

export function AuthProvider({ children, onCrossTabSignOut }: Props) {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setIsLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
    })
    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!onCrossTabSignOut) return
    return subscribeToCrossTabSignOut(onCrossTabSignOut)
  }, [onCrossTabSignOut])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    isLoading,

    async signInWithOtp(email) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      })
      if (error) throw error
      return { sent: true }
    },

    async verifyOtp(email, token) {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
      if (error) throw error
      const mfaState = await this.getMfaState()
      // Returning user with factor enrolled but only aal1 → needs challenge
      const requiresMfa =
        mfaState.currentLevel === 'aal1' &&
        (mfaState.nextLevel === 'aal2' || mfaState.factors.length > 0)
      return { requiresMfa }
    },

    async enrollMfa() {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'intraday-trade-spy',
      })
      if (error) throw error
      return {
        factorId: data.id,
        qrCodeUrl: data.totp.qr_code,
        secret: data.totp.secret,
      }
    },

    async confirmMfaEnrollment(factorId, code) {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      })
      if (verifyError) throw verifyError
    },

    async challengeMfa(factorId, code) {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      })
      if (verifyError) throw verifyError
    },

    async signOut() {
      await supabase.auth.signOut()
    },

    async getMfaState() {
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      const factorsResult = await supabase.auth.mfa.listFactors()
      const factors = (factorsResult.data?.all ?? []).map((f: { id: string }) => ({ id: f.id }))
      return {
        currentLevel: aal.data?.currentLevel ?? null,
        nextLevel: aal.data?.nextLevel ?? null,
        factors,
      }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
