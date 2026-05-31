# Contract: Background Tasks + Run Lifecycle

How backtests run asynchronously inside the FastAPI process, and what guarantees the run-state machine provides.

## Module surface

```python
# intraday_trade_spy.api.lifecycle

def start_backtest(
    *,
    user_id: UUID,
    config_id: UUID,
    strategy_id: UUID,
    data_csv_path: Path,
    storage_client: SupabaseStorageClient,
    background_tasks: BackgroundTasks,
) -> UUID:
    """Insert a new run row in status='queued', enqueue the BackgroundTask.

    Returns the run_id immediately. The actual backtest happens later in
    the BackgroundTask.

    Raises:
        ConcurrentRunCapExceeded — if the user's _active_runs set is full
        SchemaError — if config / strategy lookups fail
    """

def _run_backtest_task(
    *,
    run_id: UUID,
    user_id: UUID,
    config_id: UUID,
    strategy_id: UUID,
    data_csv_path: Path,
    storage_client: SupabaseStorageClient,
) -> None:
    """The BackgroundTask body. Runs the engine, pushes results + status atomically.

    Sequence (clarification 2026-05-30 / Q1 — finalize step is one atomic write):
      1. UPDATE runs SET status='running', status_updated_at=now() WHERE id=run_id
      2. logger.log_lifecycle_event(kind='backtest_started', run_id=run_id)
      3. Run BacktestEngine.run() in-process
      4. Build PushRunPayload from result
      5. storage_client.push_run_finalize(payload)
         -> single Postgres transaction:
            - INSERT trades, signals, journal_events
            - UPDATE runs SET status='finished', status_updated_at=now(), summary=<...>
            - All-or-nothing. A crash mid-transaction rolls back EVERYTHING.
      6. logger.log_lifecycle_event(kind='backtest_finished', run_id=run_id)

    On any failure between steps 1-5:
      - UPDATE runs SET status='failed', failure_reason=<exc>, status_updated_at=now()
      - logger.log_lifecycle_event(kind='backtest_failed', run_id=run_id, error=<exc>)
      - The atomic push_run_finalize() guarantees no half-written cloud state OR
        inconsistent status. If push_run_finalize succeeded, status is 'finished'.
        If it raised, no rows persisted and we UPDATE to 'failed' separately.
    Always: remove from _active_runs set (whether success or failure).
    """

def sweep_stale_runs(storage_client: SupabaseStorageClient, max_age_minutes: int = 15) -> int:
    """Startup-time reconciliation: transition any running rows older than
    max_age_minutes to failed.

    Returns the number of rows reaped. Logged at INFO level.

    Called from FastAPI's `@app.on_event("startup")` hook.
    """
```

## In-memory concurrency tracker

```python
# Module-level dict in intraday_trade_spy.api.lifecycle
_active_runs: dict[UUID, set[UUID]] = {}  # user_id -> set of active run_ids
_active_runs_lock: threading.Lock  # protects mutations under concurrent requests
```

**Rules**:
- Add `run_id` to `_active_runs[user_id]` before insertion.
- Remove on background-task completion (success OR failure).
- Cap check: if `len(_active_runs[user_id]) >= max_concurrent_runs_per_user`, raise `ConcurrentRunCapExceeded`.
- Single-worker assumption: this in-memory tracker is authoritative. If we ever go multi-worker, this becomes a DB-level check.

## State transitions (authoritative)

The state machine is enforced by `lifecycle.py`. Two modules write to `runs.status`:
- `lifecycle.py` — `queued → running` and `running → failed` transitions (plain UPDATEs).
- `storage.client.push_run_finalize()` — `running → finished` transition (atomic with data writes; see Q1 below).

```
   POST /api/backtests
            │
            │ insert row (status='queued')
            ▼
        ╔════════╗
        ║ queued ║                                       ┌── startup sweep ──┐
        ╚═══╤════╝                                       │                   │
            │ background task picks up                   │                   │
            ▼                                            ▼                   ▼
        ╔═════════╗                  ╔══════════╗   ╔════════╗     stale running
        ║ running ║ ─────────────►   ║ finished ║   ║ failed ║ ◄── rows reaped
        ╚════╤════╝   push_run_      ╚══════════╝   ╚════════╝
             │        finalize() —
             │        ATOMIC with
             │        data inserts
             │
             │ engine error / push error / cap exceeded
             ▼
        ╔════════╗
        ║ failed ║
        ╚════════╝
```

**Invariants**:
- A row can transition `queued → running → finished` OR `queued → failed` OR `running → failed`.
- A row in `finished` or `failed` is terminal — no further transitions are valid.
- `failure_reason` is `NULL` for `finished` rows; `NOT NULL` for `failed` rows.
- **`running → finished` is atomic with the data writes** (clarification 2026-05-30 / Q1). There is no observable intermediate state where a run has trades/signals/journal data but `status = 'running'`. If a client polls and sees `status = 'finished'`, all of that run's data is queryable.

## Crash-recovery contract (FR-015)

When the service restarts (deploy, OOM, crash), in-memory state is lost but the `runs` table persists. Any row still in `status='running'` at restart is "orphaned."

**On startup**, `sweep_stale_runs` runs ONCE:

```sql
UPDATE runs
   SET status = 'failed',
       failure_reason = 'Run interrupted by service restart',
       status_updated_at = now()
 WHERE status = 'running'
   AND status_updated_at < now() - interval '15 minutes'
```

This guarantees the user sees `failed` (not `running`) for runs that were in flight when the service died, satisfying FR-015 and the edge case "Long-running backtest crashes mid-run."

Note: the 15-minute window means a recent `running` row may NOT be reaped immediately at startup — but it cannot have an active BackgroundTask either (those are lost on restart), so polling will eventually time out from the client side and the row will age into the sweep window on the next restart.

## Concurrent-run cap (FR-016, SC-009)

```python
DEFAULT_MAX_CONCURRENT_RUNS_PER_USER = 5  # configurable in config.yaml
```

Check happens BEFORE the runs row is inserted:

```python
with _active_runs_lock:
    user_active = _active_runs.setdefault(user_id, set())
    if len(user_active) >= max_concurrent:
        raise ConcurrentRunCapExceeded(
            f"User has {len(user_active)} active runs; cap is {max_concurrent}"
        )
    user_active.add(run_id)  # reserve the slot
```

If the user requests a 6th concurrent run, they get `429 Too Many Requests` with `{"error": "concurrent_run_cap_exceeded", "message": "...", "active_runs": 5, "cap": 5}`.

## Test obligations

| Test | Expected |
|---|---|
| `start_backtest` inserts row + enqueues task | row in `queued` status; `_active_runs[user_id]` contains the run_id |
| BackgroundTask transitions `queued → running → finished` | observable via 3 SELECTs spaced by a poll loop |
| BackgroundTask on engine crash transitions to `failed` with reason | `failed`, `failure_reason` non-null |
| Atomic push: engine succeeds but push_run_finalize() raises | row stays `running`, then the catch handler UPDATEs it to `failed`; NO trades/signals/journal in DB |
| **Atomic finalize: push_run_finalize() succeeds — status flips to `finished` AND data lands in one transaction** (Q1) | poll loop never observes `status='running'` with non-empty `trades`/`signals` for the same `run_id` |
| **Atomic finalize: simulate a process crash between data-write and status-update by aborting the connection mid-RPC** | run row stays in `running` (because the whole transaction rolled back); the next startup sweep transitions it to `failed` per FR-015. No partial trades/signals in DB. |
| 6th concurrent run → 429 | response code 429; no row inserted |
| Concurrency: 5 simultaneous starts → all 5 succeed; 6th fails | tested via asyncio.gather() |
| sweep_stale_runs on startup with one stale `running` row | row transitions to `failed` with reason "interrupted by service restart" |
| sweep_stale_runs on startup with a recent `running` row | NOT reaped (still in 15-min window) |
| BackgroundTask completion releases the active-runs slot | `_active_runs[user_id]` doesn't contain the run_id after completion |
| Crash recovery: kill the process mid-run; restart | new `start_backtest` for the same user succeeds (slot released by sweep) |
