/**
 * Cross-tab sign-out listener (clarification Q3 / FR-020).
 *
 * supabase-js fires `onAuthStateChange` events across tabs via the
 * localStorage `storage` event. We subscribe at the app root; when a
 * SIGNED_OUT event arrives, the registered callback fires (typically a
 * route navigation to /sign-in).
 */
import { getSupabase } from './supabase-client'

export type CrossTabSignOutHandler = () => void

export function subscribeToCrossTabSignOut(onSignedOut: CrossTabSignOutHandler): () => void {
  const supabase = getSupabase()
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      onSignedOut()
    }
  })
  return () => {
    data.subscription.unsubscribe()
  }
}
