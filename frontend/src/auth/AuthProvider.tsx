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

export interface AuthContextValue {
  session: Session | null
  user: User | null
  isLoading: boolean
  signInWithOtp(email: string): Promise<{ sent: true }>
  verifyOtp(email: string, token: string): Promise<void>
  signOut(): Promise<void>
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
    },

    async signOut() {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
