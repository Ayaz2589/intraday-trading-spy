/**
 * Refresh-token retry helper (clarification Q5).
 *
 * Wraps an auth-sensitive operation with bounded retry. On exhaustion,
 * throws SessionExpiredError, which the router's auth guard catches to
 * redirect to /sign-in?next=<current>.
 */
import { REFRESH_RETRY_BACKOFFS_MS } from '@/config'

export class SessionExpiredError extends Error {
  constructor(public readonly cause: unknown) {
    super('Session expired or refresh failed after retry exhaustion')
    this.name = 'SessionExpiredError'
  }
}

function isTransientAuthError(err: unknown): boolean {
  // Conservative: network errors are transient; everything else not.
  if (err instanceof TypeError) return true // fetch network errors
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
    return true
  }
  if (message.includes('429') || message.includes('503')) return true
  return false
}

export async function withRefreshRetry<T>(
  op: () => Promise<T>,
  backoffs: readonly number[] = REFRESH_RETRY_BACKOFFS_MS
): Promise<T> {
  let lastError: unknown = undefined
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      return await op()
    } catch (err) {
      lastError = err
      if (!isTransientAuthError(err) || attempt === backoffs.length) {
        throw new SessionExpiredError(lastError)
      }
      await new Promise(r => setTimeout(r, backoffs[attempt]))
    }
  }
  throw new SessionExpiredError(lastError)
}
