# Contract: `intraday_trade_spy.storage` Python module

**Subject**: The new `backend/src/intraday_trade_spy/storage/` submodule exposes a typed, Pydantic-validated interface to Supabase. It is the ONLY module that imports `supabase-py`. Every other module that needs storage goes through this module.

## Public surface

```python
# intraday_trade_spy.storage.__init__
from intraday_trade_spy.storage.client import SupabaseStorageClient
from intraday_trade_spy.storage.models import (
    StrategyRow,
    ConfigRow,
    ConfigParams,
    RunRow,
    RunSummary,
    TradeRow,
    SignalRow,
    SignalIndicatorContext,
    JournalEventRow,
    JournalEventDetails,
    BarRow,
    PushRunPayload,
)
from intraday_trade_spy.storage.exceptions import (
    CloudPushError,
    AuthError,
    SchemaError,
    PartialPushError,  # raised if push_run somehow lands partial data (should be impossible)
)
```

Nothing else is exported. The raw `supabase` client is never re-exported.

## `SupabaseStorageClient`

```python
class SupabaseStorageClient:
    """Typed wrapper around supabase-py. One instance per process lifetime.
    Authenticated via service role (CLI) or anon + JWT (future features)."""

    def __init__(
        self,
        url: str,
        service_role_key: str,
        user_id: str,
    ) -> None:
        """Service-role-authenticated client scoped to a specific user.

        The user_id is the auth.users.id the service role is writing on behalf of.
        Every write call asserts that the payload's user_id matches this value.
        """
        ...

    @classmethod
    def from_env(cls) -> "SupabaseStorageClient":
        """Construct from SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID.
        Raises AuthError if any are missing."""
        ...

    def health_check(self, timeout_s: float = 5.0) -> None:
        """GET strategies?limit=1. Raises CloudPushError on timeout / non-200."""
        ...

    def push_run(self, payload: PushRunPayload) -> str:
        """Atomic upload of a complete run. Returns the run_id.

        Raises:
            CloudPushError: network / HTTP error
            AuthError: 401/403 from Supabase
            SchemaError: 400 from Postgres (CHECK / FK / RLS violation)
            PartialPushError: only if invariant broken (push_run RPC succeeded
                              but a follow-up SELECT shows missing rows — should
                              never happen given the transactional function)
        """
        ...

    def upsert_config(self, config: ConfigRow) -> str:
        """Upsert by (user_id, name); returns the row's id (existing or new).
        Used by the CLI to register the config under a stable label."""
        ...

    def get_strategy_by_key(self, key: str) -> StrategyRow:
        """Fetch the strategy registry row by its stable key.
        Raises SchemaError if not found."""
        ...
```

## Invariants the wrapper MUST enforce

1. **`user_id` consistency**: Every method that takes a payload with a `user_id` field MUST raise immediately if the payload's `user_id` differs from `self.user_id`. No silent rewriting.
2. **Pydantic validation before network**: Every method runs `payload.model_validate(payload.model_dump())` before any HTTP call. A `ValidationError` is wrapped in `SchemaError` for clearer call-site handling.
3. **Live-trading lock**: `upsert_config` rejects any config whose `live_auto_enabled = True` with `SchemaError("live_auto_enabled may not be True in v1; constitution principle V")`. (Belt-and-suspenders with the DB CHECK constraint.)
4. **Symbol lock**: Every method that touches a `symbol`-bearing row (currently only `StrategyRow`) asserts `symbol == 'SPY'`. (Belt-and-suspenders with the DB CHECK.)
5. **No raw SQL exposure**: There is no method that takes a string and executes it. All access is via typed methods.

## Test obligations (from spec FR-006, FR-008, FR-009; SC-001, SC-002)

- **Test**: Constructing `SupabaseStorageClient(user_id="A")` and calling `push_run` with a payload whose `run.user_id = "B"` raises `AuthError` before any HTTP call.
- **Test**: Constructing `SupabaseStorageClient.from_env()` with the env vars unset raises `AuthError` with a message naming each missing var.
- **Test**: `push_run` with a `RunRow` whose `summary.pnl` exceeds the `NUMERIC(18,6)` range raises `SchemaError`.
- **Test**: `push_run` with a `SignalRow` where `executed = True` but `trade_id IS NULL` raises `SchemaError` (the CHECK constraint catches this).
- **Test**: `push_run` round-trip — push a 100-trade, 1000-signal payload, then `SELECT *` via a separate authenticated user (impersonating the same `user_id` via a JWT) and confirm byte-equality (within float tolerance).
- **Test**: `push_run` called twice with the same `run_id` — second call raises `SchemaError` (UNIQUE violation), no half-state.
- **Test**: `upsert_config` with `live_auto_enabled=True` raises `SchemaError` before any HTTP call (defensive check in wrapper).
