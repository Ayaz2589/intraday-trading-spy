-- 0052_push_run_finalize.sql
-- The atomic finalize RPC (clarification 2026-05-30 / Q1): inserts trades /
-- signals / journal_events AND updates runs.status='finished' in ONE
-- transaction. Eliminates the inconsistency window where data could land
-- without status flipping (and vice versa) on a process crash.
--
-- Used by the FastAPI BackgroundTask completing a backtest. The original
-- push_run(jsonb) from Feature 005 is unchanged (CLI push path still uses it).
--
-- See specs/006-fastapi-service-expansion/data-model.md §5.

CREATE OR REPLACE FUNCTION public.push_run_finalize(payload jsonb)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    run_uuid       UUID := (payload->'run'->>'id')::UUID;
    payload_uid    UUID := (payload->'run'->>'user_id')::UUID;
    caller_uid     UUID;
    current_status TEXT;
BEGIN
    -- Service role (FastAPI BackgroundTask) may push on behalf of any user
    -- when the payload's user_id matches the row's user_id.
    IF auth.role() = 'service_role' THEN
        caller_uid := payload_uid;
    ELSE
        caller_uid := auth.uid();
        IF caller_uid IS NULL OR caller_uid <> payload_uid THEN
            RAISE EXCEPTION 'push_run_finalize: caller user_id mismatch';
        END IF;
    END IF;

    -- Reject if the run is not in 'running' state — protects against
    -- accidental double-finalize and against finalizing a never-started run.
    SELECT status INTO current_status FROM public.runs WHERE id = run_uuid;
    IF current_status IS NULL THEN
        RAISE EXCEPTION 'push_run_finalize: run % not found', run_uuid;
    END IF;
    IF current_status <> 'running' THEN
        RAISE EXCEPTION 'push_run_finalize: run % is in status %, expected running',
                        run_uuid, current_status;
    END IF;

    -- Insert dependent rows. Same shape as push_run(jsonb).
    IF jsonb_array_length(COALESCE(payload->'trades', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.trades
        SELECT * FROM jsonb_populate_recordset(NULL::public.trades, payload->'trades');
    END IF;
    IF jsonb_array_length(COALESCE(payload->'signals', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.signals
        SELECT * FROM jsonb_populate_recordset(NULL::public.signals, payload->'signals');
    END IF;
    IF jsonb_array_length(COALESCE(payload->'journal_events', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.journal_events
        SELECT * FROM jsonb_populate_recordset(NULL::public.journal_events, payload->'journal_events');
    END IF;

    -- Flip status to 'finished' in the same transaction.
    UPDATE public.runs
       SET status = 'finished',
           status_updated_at = now(),
           summary = COALESCE(payload->'run'->'summary', summary)
     WHERE id = run_uuid;

    RETURN run_uuid;
END;
$$;
