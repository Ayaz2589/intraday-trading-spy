/**
 * Typed FastAPI fetch wrapper (Feature 007).
 *
 * Replaces the legacy static-server client (now at `legacy-client.ts`).
 * Handles Authorization header attachment, error mapping, and refresh-retry
 * on 401. Every API call in the new app goes through this wrapper.
 */
import { ENV } from '@/env'
import { getSupabase } from '@/auth/supabase-client'
import { SessionExpiredError } from '@/auth/refresh-retry'
import type { ApiErrorBody } from './types'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | string,
    message?: string
  ) {
    super(message ?? `API error ${status}`)
    this.name = 'ApiError'
  }
}

export class NotFoundError extends ApiError {
  constructor(public readonly path: string, body: ApiErrorBody | string = '') {
    super(404, body, `Resource not found: ${path}`)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends ApiError {
  constructor(body: ApiErrorBody | string) {
    super(400, body, 'Request validation failed')
    this.name = 'ValidationError'
  }
}

export class RateLimitedError extends ApiError {
  constructor(body: ApiErrorBody) {
    super(429, body, body.message ?? 'Rate limited')
    this.name = 'RateLimitedError'
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(body: ApiErrorBody | string) {
    super(503, body, 'Service unavailable')
    this.name = 'ServiceUnavailableError'
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  searchParams?: Record<string, string | number | boolean | undefined>
  noAuth?: boolean
}

async function readJson(response: Response): Promise<ApiErrorBody | string> {
  const text = await response.text()
  if (!text) return ''
  try {
    return JSON.parse(text) as ApiErrorBody
  } catch {
    return text
  }
}

let _retrying401 = false

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = new URL(path, ENV.API_BASE_URL)
  if (options.searchParams) {
    for (const [k, v] of Object.entries(options.searchParams)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (!options.noAuth) {
    const token = await getAccessToken()
    if (!token) throw new SessionExpiredError('no session')
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (response.ok) return (await response.json()) as T

  const body = await readJson(response)

  if (response.status === 401 && !_retrying401 && !options.noAuth) {
    _retrying401 = true
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.refreshSession()
      if (error) throw new SessionExpiredError(error)
      return await apiRequest<T>(path, options)
    } finally {
      _retrying401 = false
    }
  }
  if (response.status === 401) throw new SessionExpiredError(body)
  if (response.status === 404) throw new NotFoundError(path, body)
  if (response.status === 400 || response.status === 422) throw new ValidationError(body)
  if (response.status === 429) throw new RateLimitedError(body as ApiErrorBody)
  if (response.status === 503) throw new ServiceUnavailableError(body)

  throw new ApiError(response.status, body)
}
