-- 0030_push_run_function.sql
-- Atomic push: writes runs + trades + signals + journal_events in a single
-- transaction. See data-model.md §Postgres Function and research.md §7.
--
-- Caller contract:
--   payload jsonb shape: {
--     "run": <runs row JSON>,
--     "trades": [<trades row JSON>, ...],
--     "signals": [<signals row JSON>, ...],
--     "journal_events": [<journal_events row JSON>, ...]
--   }
--
-- Security: SECURITY INVOKER so the caller's RLS context applies. The service
-- role bypasses RLS but the function still validates caller_uid matches the
-- payload's user_id.

CREATE OR REPLACE FUNCTION public.push_run(payload jsonb)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    run_uuid    UUID := (payload->'run'->>'id')::UUID;
    payload_uid UUID := (payload->'run'->>'user_id')::UUID;
    caller_uid  UUID;
BEGIN
    -- The service role (CLI in v005) is allowed to push on behalf of any
    -- user, but it MUST provide the user_id in the payload. Authenticated
    -- users may only push their own data.
    IF auth.role() = 'service_role' THEN
        caller_uid := payload_uid;
    ELSE
        caller_uid := auth.uid();
        IF caller_uid IS NULL OR caller_uid <> payload_uid THEN
            RAISE EXCEPTION 'push_run: caller user_id mismatch';
        END IF;
    END IF;

    -- Insert the run row
    INSERT INTO public.runs
    SELECT * FROM jsonb_populate_record(NULL::public.runs, payload->'run');

    -- Insert trades (may be empty)
    IF jsonb_array_length(COALESCE(payload->'trades', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.trades
        SELECT * FROM jsonb_populate_recordset(NULL::public.trades, payload->'trades');
    END IF;

    -- Insert signals (may be empty)
    IF jsonb_array_length(COALESCE(payload->'signals', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.signals
        SELECT * FROM jsonb_populate_recordset(NULL::public.signals, payload->'signals');
    END IF;

    -- Insert journal_events (may be empty)
    IF jsonb_array_length(COALESCE(payload->'journal_events', '[]'::jsonb)) > 0 THEN
        INSERT INTO public.journal_events
        SELECT * FROM jsonb_populate_recordset(NULL::public.journal_events, payload->'journal_events');
    END IF;

    RETURN run_uuid;
END;
$$;
