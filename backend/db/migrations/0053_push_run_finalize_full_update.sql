-- 0053_push_run_finalize_full_update.sql
-- Extend push_run_finalize() to update ALL run-row fields from the payload,
-- not just status + summary. The original migration in 0052 only updated
-- status + summary; this left run.started_at / .finished_at / .range_start /
-- .range_end / .bar_count / .data_fingerprint / .app_version showing the
-- placeholder values from insert_queued_run() instead of the engine's real
-- output.
--
-- Use CREATE OR REPLACE — no schema change, just function-body update.

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
    IF auth.role() = 'service_role' THEN
        caller_uid := payload_uid;
    ELSE
        caller_uid := auth.uid();
        IF caller_uid IS NULL OR caller_uid <> payload_uid THEN
            RAISE EXCEPTION 'push_run_finalize: caller user_id mismatch';
        END IF;
    END IF;

    SELECT status INTO current_status FROM public.runs WHERE id = run_uuid;
    IF current_status IS NULL THEN
        RAISE EXCEPTION 'push_run_finalize: run % not found', run_uuid;
    END IF;
    IF current_status <> 'running' THEN
        RAISE EXCEPTION 'push_run_finalize: run % is in status %, expected running',
                        run_uuid, current_status;
    END IF;

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

    -- Update ALL run-row fields from the payload alongside status flip.
    -- COALESCE preserves whatever insert_queued_run set when the payload
    -- omits a field.
    UPDATE public.runs
       SET status            = 'finished',
           status_updated_at = now(),
           summary           = COALESCE(payload->'run'->'summary', summary),
           started_at        = COALESCE((payload->'run'->>'started_at')::TIMESTAMPTZ, started_at),
           finished_at       = COALESCE((payload->'run'->>'finished_at')::TIMESTAMPTZ, finished_at),
           range_start       = COALESCE((payload->'run'->>'range_start')::DATE, range_start),
           range_end         = COALESCE((payload->'run'->>'range_end')::DATE, range_end),
           bar_count         = COALESCE((payload->'run'->>'bar_count')::INTEGER, bar_count),
           data_fingerprint  = COALESCE(payload->'run'->>'data_fingerprint', data_fingerprint),
           app_version       = COALESCE(payload->'run'->>'app_version', app_version)
     WHERE id = run_uuid;

    RETURN run_uuid;
END;
$$;
