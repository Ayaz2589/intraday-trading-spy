# Contract: API Endpoints

Every endpoint's request shape, response shape, and error matrix. Authoritative for the `tests/api/new/` and `tests/api/integration/` test files.

## Pagination (clarification 2026-05-30 / Q2)

Every list endpoint (`GET /api/runs`, `GET /api/runs/{id}/trades`, `GET /api/runs/{id}/signals`, `GET /api/runs/{id}/journal`) uses **opaque cursor** pagination:

- Request: `?limit=<n>&cursor=<opaque-base64>`. `limit` defaults to 20, max 100. `cursor` is optional (absent = first page).
- Response: `{"<resource>": [...], "next_cursor": "<opaque-base64>" | null}`. `null` cursor means no more pages.
- The cursor encodes a `(natural_ordering_column, id)` tuple per resource, base64-url-encoded. Clients MUST treat it as a black box. Server-side decoding lives in `backend/src/intraday_trade_spy/api/pagination.py`.

Natural ordering keys:

| Endpoint | Ordering | Encoded as |
|---|---|---|
| `GET /api/runs` | `started_at DESC, id DESC` | `base64url(<started_at>|<run_id>)` |
| `GET /api/runs/{id}/trades` | `entry_at ASC, id ASC` | `base64url(<entry_at>|<trade_id>)` |
| `GET /api/runs/{id}/signals` | `emitted_at ASC, id ASC` | `base64url(<emitted_at>|<signal_id>)` |
| `GET /api/runs/{id}/journal` | `occurred_at ASC, id ASC` | `base64url(<occurred_at>|<event_id>)` |

Pagination is stable under concurrent inserts/deletes: a new row arriving at the head doesn't make a cursor skip a row mid-page (Q2 rationale).

Error: a malformed / corrupted cursor returns `400 invalid_cursor`.

## CORS (clarification 2026-05-30 / Q4)

Allowed origins resolve in this order:

1. `CORS_ALLOW_ORIGINS` env var (comma-separated), if set — replaces config defaults.
2. `backend/config/config.yaml` `api.cors_allow_origins` list — used in development.

Additionally, `CORS_ALLOW_ORIGIN_REGEX` env var (Python `re` syntax) matches deployment-platform preview-branch domains. Feature 008 sets this for Vercel preview URLs.

Source code MUST NOT hardcode any production origin. Tests assert that setting `CORS_ALLOW_ORIGINS=https://example.test` and starting the app accepts only that origin.

## Authentication

| Endpoint | Auth required? | Notes |
|---|---|---|
| `GET /healthz` | No | Liveness/readiness probe |
| `GET /legacy/*` | No | Feature 003 backward-compat |
| All other `/api/*` | Yes | `Authorization: Bearer <jwt>` required |

Unauthenticated request to a protected endpoint → `401 Unauthorized` with `{"error": "missing_or_invalid_token"}`.

## `GET /healthz`

**Request**: none

**Response 200**:
```json
{"status": "ok", "db": "ok"}
```

**Response 503** (DB unreachable):
```json
{"status": "ok", "db": "unreachable"}
```

**Test obligations**:
- Returns within 200ms when DB is reachable (SC-005).
- Returns 503 (not 500) when DB is unreachable; doesn't leak the exception trace.
- Does not require a JWT.

## `POST /api/backtests`

**Request body**:
```json
{
  "config_name": "default",
  "data_csv_path": "data/raw/spy_5m_sample.csv"
}
```

`data_csv_path` is optional; defaults to the config's `data.csv_path`.

**Response 202**:
```json
{"run_id": "fe90f357-def9-443d-8e3a-2e0e6fc920fc", "status": "queued"}
```

**Errors**:
| Code | When |
|---|---|
| `400` | Body malformed; config_name missing |
| `401` | Missing/invalid JWT |
| `404` | `config_name` not found for this user |
| `429` | Per-user concurrent-run cap reached (default 5) |
| `503` | DB unreachable |

**Test obligations**:
- Returns within 1s regardless of how long the backtest itself takes (SC-003).
- The `runs` row exists in `status = 'queued'` immediately after the response.
- The BackgroundTask transitions the row to `running` then `finished` within 60s on the bundled fixture (SC-001).
- 6th concurrent run for the same user returns `429` (FR-016, SC-009).
- A request with `symbol` in the body is rejected with `400` (constitution I — no symbol overrides).

## `GET /api/runs`

**Query params**:
- `limit` (default 20, max 100)
- `cursor` (opaque; from previous response)

**Response 200**:
```json
{
  "runs": [
    {
      "id": "fe90f357-...",
      "started_at": "2026-05-31T02:05:08Z",
      "finished_at": "2026-05-31T02:05:09Z",
      "status": "finished",
      "range_start": "2026-05-26",
      "range_end": "2026-05-28",
      "summary": { "pnl": "0.0", "total_trades": 3, "rejected_signals": 117, ... }
    }
  ],
  "next_cursor": null
}
```

**Errors**: `401`, `503`

**Test obligations**:
- Returns only the authenticated user's runs (cross-user isolation, FR-002, SC-002).
- Pagination cursor opaque; next_cursor is null when no more runs.
- Newest-first ordering by `started_at`.

## `GET /api/runs/{id}`

**Response 200**: same shape as a single entry in `GET /api/runs` runs array.

**Errors**:
| Code | When |
|---|---|
| `401` | Missing/invalid JWT |
| `404` | Run not found OR belongs to another user (no leak; FR-002) |

**Test obligations**:
- User A requesting user B's run id → `404` (not `403`, per research §7).
- Body matches what was pushed.

## `GET /api/runs/{id}/status`

**Response 200**:
```json
{
  "status": "running",
  "status_updated_at": "2026-05-31T02:05:08.5Z",
  "failure_reason": null
}
```

`failure_reason` is `null` unless `status = "failed"`.

**Errors**: `401`, `404`

**Test obligations**:
- Polling at 1-second intervals reaches `finished` within 60s on the bundled fixture (SC-001).
- A run reaped by the startup sweep returns `status = "failed"` with a `failure_reason` mentioning the sweep (FR-015).

## `GET /api/runs/{id}/trades`

**Query params**: `limit`, `cursor` (same pattern).

**Response 200**:
```json
{
  "trades": [
    {
      "id": "...",
      "direction": "LONG",
      "entry_at": "...", "entry_price": "525.6000",
      "stop_price": "525.0000", "target_price": "527.0000",
      "exit_at": "...", "exit_price": "526.7253",
      "exit_reason": "target",
      "pnl": "49.51",
      "r_multiple": "2.000"
    }
  ],
  "next_cursor": null
}
```

**Errors**: `401`, `404`

## `GET /api/runs/{id}/signals`

**Query params**: `limit`, `cursor`, `executed` (optional bool — filter to only executed or only rejected).

**Response 200**:
```json
{
  "signals": [
    {
      "id": "...",
      "emitted_at": "...",
      "executed": false,
      "entry_price": "525.6000",
      "rejection_reason": "position_size_cap",
      "trade_id": null,
      "reason_text": "...",
      "indicator_context": { "vwap": "...", "opening_range_high": "...", ... }
    }
  ],
  "next_cursor": null
}
```

**Errors**: `401`, `404`

**Test obligations**:
- Rejected signals appear alongside executed; `?executed=false` filters to only rejected (FR-006, constitution VII).

## `GET /api/runs/{id}/journal`

**Response 200**:
```json
{
  "events": [
    {
      "id": "...",
      "occurred_at": "...",
      "kind": "force_flat",
      "severity": "warning",
      "message": "...",
      "details": {}
    }
  ],
  "next_cursor": null
}
```

**Errors**: `401`, `404`

## `POST /api/data/download`

**Request body**:
```json
{"start_date": "2026-04-01", "end_date": "2026-04-15"}
```

**Response 202**:
```json
{"job_id": "...", "status": "queued"}
```

**Errors**:
| Code | When |
|---|---|
| `400` | end_date before start_date; range > 60 days (matches Feature 002 chunking) |
| `401` | |
| `429` | Per-user concurrent-download cap reached (default 3) |

**Retry behavior** (clarification 2026-05-30 / Q3):

The background job retries transient yfinance failures up to 3 times with exponential backoff (`1s → 2s → 4s` by default; configured in `config.yaml` `api.data_download.retry_backoff_seconds`). The user sees `running` for the duration of the retry loop, then `finished` or `failed`.

| Failure type | Retried? |
|---|---|
| Network error (connection refused, DNS, timeout) | Yes |
| HTTP 5xx from Yahoo | Yes |
| HTTP 429 (throttling) | Yes |
| HTTP 4xx other than 429 | No |
| Invalid date range (start > end, > 60 days) | No (caught before retry loop) |
| "No data" empty result | No |
| Pandas parse error / unexpected schema | No |

After 3 failed attempts, the job's `status` becomes `failed` with `failure_reason` containing the final-attempt exception (truncated to a sensible length).

**Test obligations**:
- Returns within 1s regardless of how long the download takes.
- Background job uploads CSV to Supabase Storage at `{user_id}/spy_5m_{start}_{end}.csv`.
- On completion, `data_download_jobs.status = "finished"` and `storage_path` is populated.
- Mock a 429 followed by a 200 — job completes via retry, `status = "finished"`.
- Mock 3 consecutive 429s — job fails after exhausting retries, `status = "failed"`, `failure_reason` mentions the retry exhaustion.
- Mock an invalid date range — job fails immediately (no retry), `failure_reason` says "no_data" or "invalid_range".

## `GET /api/data/downloads/{id}`

**Response 200**:
```json
{
  "id": "...",
  "start_date": "...",
  "end_date": "...",
  "status": "finished",
  "storage_path": "{user_id}/spy_5m_2026-04-01_2026-04-15.csv",
  "failure_reason": null
}
```

**Errors**: `401`, `404`

## `GET /api/strategies`

**Response 200**:
```json
{
  "strategies": [
    {
      "key": "vwap_pullback_long",
      "display_name": "VWAP Pullback (Long)",
      "description": "...",
      "symbol": "SPY",
      "direction": "LONG",
      "kind": "rule_based",
      "enabled": true
    }
  ]
}
```

**Errors**: `401`

**Test obligations**:
- Returns enabled strategies only (`enabled = TRUE` filter).
- Body matches what was seeded by Feature 005's `0020_seed_strategies.sql`.

## Error response shape

All error responses follow:
```json
{"error": "machine_readable_code", "message": "Human-readable message"}
```

`error` codes (stable contract):
- `missing_or_invalid_token`
- `forbidden` (currently unused; reserved)
- `not_found`
- `config_not_found`
- `validation_error`
- `concurrent_run_cap_exceeded`
- `download_cap_exceeded`
- `db_unreachable`
- `internal_error` (only as last-resort; logged with traceback server-side)

## Test obligations summary

Every endpoint has:
1. **Unit test** under `tests/api/new/` — uses FastAPI `TestClient` with `app.dependency_overrides[auth_user_id] = lambda: TEST_USER_UUID` to bypass real JWT validation; mocks the `SupabaseStorageClient`.
2. **Integration test** under `tests/api/integration/` — uses a real local Supabase + a real JWT minted by the helper `mint_jwt(user_id)`.
3. **Cross-user test** under `tests/api/integration/test_cross_user_isolation.py` — user A's JWT + user B's resource id → `404`.

The complete test matrix is enumerated in `tests/api/integration/test_cross_user_isolation.py` and runs against every endpoint with a `{id}` path parameter.
