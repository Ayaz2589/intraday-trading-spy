import { describe, expect, it, vi } from 'vitest'
import { SessionExpiredError, withRefreshRetry } from './refresh-retry'

describe('withRefreshRetry', () => {
  it('returns immediately on first success', async () => {
    const op = vi.fn().mockResolvedValue('ok')
    const result = await withRefreshRetry(op, [10, 20, 40])
    expect(result).toBe('ok')
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries on transient network failures and succeeds', async () => {
    let calls = 0
    const op = vi.fn().mockImplementation(async () => {
      calls += 1
      if (calls < 3) throw new TypeError('network error')
      return 'recovered'
    })
    const result = await withRefreshRetry(op, [1, 2, 4]) // tiny backoffs for tests
    expect(result).toBe('recovered')
    expect(op).toHaveBeenCalledTimes(3)
  })

  it('throws SessionExpiredError after exhausting all retries', async () => {
    const op = vi.fn().mockRejectedValue(new TypeError('network'))
    await expect(withRefreshRetry(op, [1, 2, 4])).rejects.toBeInstanceOf(SessionExpiredError)
    expect(op).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
  })

  it('throws SessionExpiredError immediately on non-transient errors', async () => {
    const op = vi.fn().mockRejectedValue(new Error('invalid token'))
    await expect(withRefreshRetry(op, [1, 2, 4])).rejects.toBeInstanceOf(SessionExpiredError)
    expect(op).toHaveBeenCalledTimes(1) // no retries
  })
})
