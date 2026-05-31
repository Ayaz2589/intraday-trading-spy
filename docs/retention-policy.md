# Data retention policy

**Status**: Declared. Not enforced in Feature 006. Enforcement deferred to a later feature or to a Supabase `pg_cron` job configured in Feature 008's deployment.

**Source**: clarification 2026-05-30 / Q5 of feature [006-fastapi-service-expansion](../specs/006-fastapi-service-expansion/spec.md).

## What's eligible for deletion

| Row class | Retention | Eligibility filter |
|---|---|---|
| `runs` where `status = 'failed'` | 90 days | `status = 'failed' AND status_updated_at < now() - interval '90 days'` |
| `journal_events` where `kind = 'api_request_received'` | 30 days | `kind = 'api_request_received' AND occurred_at < now() - interval '30 days'` |
| `data_download_jobs` where `status = 'failed'` | 30 days | `status = 'failed' AND status_updated_at < now() - interval '30 days'` |
| `runs` where `status = 'finished'` | INDEFINITE | not pruned — user's research history |
| `journal_events` (kinds other than `api_request_received`) | INDEFINITE | trade-lifecycle audit (constitution VII) |
| `trades`, `signals` | INDEFINITE | anchored to `runs`; cascade-delete via FK when `runs` row is pruned |

## Defaults

Defaults live in `backend/config/config.yaml`:

```yaml
retention:
  failed_runs_days: 90
  audit_events_days: 30
  failed_downloads_days: 30
```

## Why declared but not enforced

- Shipping the policy gives downstream operators (Feature 008 deploys, ops folks) something concrete to enforce against.
- Deferring the enforcement avoids accidentally deleting data the team turns out to want — particularly during early debugging of the cloud platform.
- Aligns with the "ship the policy, not the cron job" engineering principle.

## How to enforce (future)

Three plausible enforcement paths:

1. **Supabase `pg_cron`**: Feature 008 configures a nightly job. Cleanest separation — the database deletes itself on schedule.
2. **Standalone Python script**: `python -m intraday_trade_spy.scripts.prune_retention` invoked by an external scheduler (cron, GitHub Actions, etc.).
3. **API-side reaper**: a startup-time sweep, similar to `sweep_stale_runs` but for retention. Riskier — runs at every cold start, could thunder.

Recommended path: pg_cron. Feature 008 will add the SQL.

## Auditing the policy

Until enforcement lands, an operator can query for pruning-eligible rows directly:

```sql
-- Failed runs older than 90 days
SELECT count(*) FROM runs
 WHERE status = 'failed'
   AND status_updated_at < now() - interval '90 days';

-- API-audit events older than 30 days
SELECT count(*) FROM journal_events
 WHERE kind = 'api_request_received'
   AND occurred_at < now() - interval '30 days';

-- Failed downloads older than 30 days
SELECT count(*) FROM data_download_jobs
 WHERE status = 'failed'
   AND status_updated_at < now() - interval '30 days';
```

These counts grow over time. When they get uncomfortably large (or the Supabase tier limit looms), implement enforcement.
