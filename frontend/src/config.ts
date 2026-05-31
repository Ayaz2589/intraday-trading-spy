/**
 * Typed configuration constants for Feature 007.
 *
 * Polling cadences, retry budgets, and feature caps live here so they can
 * be tuned in one place without touching individual hooks/components.
 *
 * Tasks reference: T005 + (clarifications Q1, Q2, Q5).
 */

/** Polling interval for resources in `queued`/`running` state (clarification Q1). */
export const POLLING_INFLIGHT_MS = 1000

/** Polling interval for resources in `finished`/`failed` state (clarification Q1). */
export const POLLING_TERMINAL_MS = 30_000

/** Static polling cadence for list endpoints (no per-row status check). */
export const POLLING_LIST_MS = 5_000

/** Polling cadence for the /healthz probe. */
export const POLLING_HEALTH_MS = 10_000

/** Maximum concurrent in-flight runs background-tracked client-side (clarification Q2). */
export const ACTIVE_RUNS_TRACKER_CAP = 3

/**
 * Backoff in milliseconds for the refresh-token retry loop (clarification Q5).
 * Three attempts at 1s/2s/4s; if all fail, the session is treated as expired.
 */
export const REFRESH_RETRY_BACKOFFS_MS: readonly number[] = [1_000, 2_000, 4_000]

/** Health-check timeout — matches backend's. */
export const HEALTH_CHECK_TIMEOUT_MS = 5_000
