-- 0112_lockbox_ledger.sql
-- Feature 011 (Phase 2 — validation engine), US4.
-- Append-only ledger enforcing the one-shot lockbox discipline: a frozen config
-- may spend the held-out lockbox exactly once. A row is NEVER updated to
-- overwrite a result (immutability — FR-018); the lockbox's state for a (user,
-- range) is derived from the latest row. A second run against a *different*
-- config is blocked by default; the only way through is a deliberate, recorded
-- "override & burn" (state='burned', override=true) — analyze clarification.

CREATE TABLE IF NOT EXISTS public.lockbox_ledger (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lockbox_start      DATE NOT NULL,
    lockbox_end        DATE NOT NULL CHECK (lockbox_end >= lockbox_start),
    config_fingerprint TEXT NOT NULL,
    -- Nullable: the result JSONB is the authoritative immutable record; linking
    -- a persisted drill-down child run is a later enhancement (FR-005).
    run_id             UUID REFERENCES public.runs(id) ON DELETE SET NULL,
    result             JSONB NOT NULL DEFAULT '{}'::jsonb,
    state              TEXT NOT NULL CHECK (state IN ('spent','burned')),
    override           BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lockbox_ledger_user_range_idx
    ON public.lockbox_ledger (user_id, lockbox_start, lockbox_end, created_at);

ALTER TABLE public.lockbox_ledger ENABLE ROW LEVEL SECURITY;

-- Append-only for authenticated owners: SELECT + INSERT only (no UPDATE/DELETE),
-- so a spent result can never be mutated from the authenticated path.
DROP POLICY IF EXISTS lockbox_ledger_owner_select ON public.lockbox_ledger;
CREATE POLICY lockbox_ledger_owner_select ON public.lockbox_ledger
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS lockbox_ledger_owner_insert ON public.lockbox_ledger;
CREATE POLICY lockbox_ledger_owner_insert ON public.lockbox_ledger
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS lockbox_ledger_service_role_all ON public.lockbox_ledger;
CREATE POLICY lockbox_ledger_service_role_all ON public.lockbox_ledger
    FOR ALL TO service_role USING (true) WITH CHECK (true);
