/**
 * Singleton Supabase JS browser client.
 *
 * Used ONLY for auth (sign-in, MFA, refresh, cross-tab events). Data
 * fetching goes through the Feature 006 FastAPI endpoints via api/client.ts.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ENV } from '@/env'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase client requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars'
    )
  }
  _client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return _client
}

/** Reset for tests. Not for production code. */
export function _resetSupabaseClientForTests(): void {
  _client = null
}
