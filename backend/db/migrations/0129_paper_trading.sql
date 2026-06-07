-- 0129_paper_trading.sql — Feature 021 (live paper trading + /trade)
--
-- Four user-scoped tables for the forward paper-trading record. STRICTLY
-- SEPARATE from runs/study tables (spec Clarifications 2026-06-07): nothing
-- here is read by Insights aggregates, gates, or recommendations.
--
-- 1) paper_sessions: one row per operator-initiated automation session
--    (multi-day; one running per user via partial unique index — the same
--    database-enforced pattern as research_campaigns).
-- 2) paper_orders: every order sent to the brokerage paper account
--    (entries, protective legs, closes) — the audit trail; broker is truth.
-- 3) paper_trades: completed round-trips — the forward evidence unit, with
--    realized_r computed by the backtest definition.
-- 4) paper_events: APPEND-ONLY live journal (signal taxonomy + lifecycle
--    kinds); insert+select policies only — no update path exists.

CREATE TABLE IF NOT EXISTS public.paper_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_id     UUID NOT NULL REFERENCES public.strategies(id),
    config_id       UUID REFERENCES public.configs(id) ON DELETE SET NULL,
    config_name     TEXT NOT NULL,
    config_snapshot JSONB NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('running', 'stopped', 'interrupted')),
    entries_paused  BOOLEAN NOT NULL DEFAULT false,
    pause_reason    TEXT CHECK (pause_reason IN ('stale_data', 'reconcile_mismatch')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    stopped_at      TIMESTAMPTZ,
    stop_reason     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS paper_sessions_one_running_idx
    ON public.paper_sessions (user_id) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS paper_sessions_user_recent_idx
    ON public.paper_sessions (user_id, started_at DESC);

ALTER TABLE public.paper_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paper_sessions_select_own ON public.paper_sessions;
CREATE POLICY paper_sessions_select_own ON public.paper_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS paper_sessions_insert_own ON public.paper_sessions;
CREATE POLICY paper_sessions_insert_own ON public.paper_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS paper_sessions_update_own ON public.paper_sessions;
CREATE POLICY paper_sessions_update_own ON public.paper_sessions
    FOR UPDATE USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.paper_orders (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id       UUID NOT NULL REFERENCES public.paper_sessions(id) ON DELETE CASCADE,
    broker_order_id  TEXT UNIQUE,
    client_order_id  TEXT NOT NULL,
    leg              TEXT NOT NULL CHECK (leg IN ('entry', 'take_profit', 'stop_loss', 'close')),
    origin           TEXT NOT NULL CHECK (origin IN ('strategy', 'manual', 'force_flat')),
    side             TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    qty              INTEGER NOT NULL CHECK (qty > 0),
    limit_price      NUMERIC,
    stop_price       NUMERIC,
    status           TEXT NOT NULL,
    filled_qty       INTEGER NOT NULL DEFAULT 0,
    filled_avg_price NUMERIC,
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw              JSONB
);

CREATE INDEX IF NOT EXISTS paper_orders_session_idx
    ON public.paper_orders (session_id, submitted_at);

ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paper_orders_select_own ON public.paper_orders;
CREATE POLICY paper_orders_select_own ON public.paper_orders
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS paper_orders_insert_own ON public.paper_orders;
CREATE POLICY paper_orders_insert_own ON public.paper_orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS paper_orders_update_own ON public.paper_orders;
CREATE POLICY paper_orders_update_own ON public.paper_orders
    FOR UPDATE USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.paper_trades (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id     UUID NOT NULL REFERENCES public.paper_sessions(id) ON DELETE CASCADE,
    trading_day    DATE NOT NULL,
    origin         TEXT NOT NULL CHECK (origin IN ('strategy', 'manual')),
    qty            INTEGER NOT NULL CHECK (qty > 0),
    entry_time     TIMESTAMPTZ NOT NULL,
    exit_time      TIMESTAMPTZ NOT NULL,
    entry_price    NUMERIC NOT NULL,
    exit_price     NUMERIC NOT NULL,
    stop_loss      NUMERIC NOT NULL,
    take_profit    NUMERIC NOT NULL,
    exit_reason    TEXT NOT NULL CHECK (exit_reason IN ('stop', 'target', 'force_flat', 'manual')),
    gross_pnl      NUMERIC NOT NULL,
    fees           NUMERIC NOT NULL DEFAULT 0,
    realized_r     NUMERIC NOT NULL,
    entry_order_id UUID REFERENCES public.paper_orders(id) ON DELETE SET NULL,
    exit_order_id  UUID REFERENCES public.paper_orders(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paper_trades_user_day_idx
    ON public.paper_trades (user_id, trading_day, entry_time);

ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paper_trades_select_own ON public.paper_trades;
CREATE POLICY paper_trades_select_own ON public.paper_trades
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS paper_trades_insert_own ON public.paper_trades;
CREATE POLICY paper_trades_insert_own ON public.paper_trades
    FOR INSERT WITH CHECK (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.paper_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id  UUID NOT NULL REFERENCES public.paper_sessions(id) ON DELETE CASCADE,
    seq         BIGINT NOT NULL,
    trading_day DATE NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,
    kind        TEXT NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS paper_events_session_seq_idx
    ON public.paper_events (session_id, seq);

ALTER TABLE public.paper_events ENABLE ROW LEVEL SECURITY;

-- Append-only by construction: select + insert policies only; no UPDATE or
-- DELETE policy exists, so rows can never be edited under RLS.
DROP POLICY IF EXISTS paper_events_select_own ON public.paper_events;
CREATE POLICY paper_events_select_own ON public.paper_events
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS paper_events_insert_own ON public.paper_events;
CREATE POLICY paper_events_insert_own ON public.paper_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);
