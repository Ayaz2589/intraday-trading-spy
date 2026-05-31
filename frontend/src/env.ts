/// <reference types="vite/client" />
/**
 * Typed env-var accessors for Vite's `import.meta.env.VITE_*`.
 *
 * Throws at module load if a required var is missing in production builds.
 * In dev, missing vars are logged as warnings (so editing `.env.local`
 * doesn't immediately crash the dev server).
 */

const PROD = import.meta.env.PROD

function readRequired(key: string): string {
  const value = import.meta.env[key] as string | undefined
  if (!value) {
    const message = `Missing required environment variable: ${key}`
    if (PROD) throw new Error(message)
    // eslint-disable-next-line no-console
    console.warn(`[env] ${message} (dev mode — continuing)`)
    return ''
  }
  return value
}

export const ENV = {
  SUPABASE_URL: readRequired('VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: readRequired('VITE_SUPABASE_ANON_KEY'),
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001',
  IS_PROD: PROD,
} as const
