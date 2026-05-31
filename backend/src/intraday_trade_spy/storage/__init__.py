"""Supabase storage wrapper.

Public surface — see specs/005-supabase-data-layer/contracts/storage-client.md.

Models, exceptions, and the storage client are accessible from this package.
The client import is lazy so callers that only need the Pydantic models can
import without pulling in the runtime `supabase` dependency.
"""

from intraday_trade_spy.storage.exceptions import (
    AuthError,
    CloudPushError,
    PartialPushError,
    SchemaError,
)
from intraday_trade_spy.storage.models import (
    BarRow,
    ConfigParams,
    ConfigRow,
    JournalEventDetails,
    JournalEventRow,
    PushRunPayload,
    RunRow,
    RunSummary,
    SignalIndicatorContext,
    SignalRow,
    StrategyRow,
    TradeRow,
)

__all__ = [
    "SupabaseStorageClient",  # lazy via __getattr__
    "AuthError",
    "CloudPushError",
    "PartialPushError",
    "SchemaError",
    "BarRow",
    "ConfigParams",
    "ConfigRow",
    "JournalEventDetails",
    "JournalEventRow",
    "PushRunPayload",
    "RunRow",
    "RunSummary",
    "SignalIndicatorContext",
    "SignalRow",
    "StrategyRow",
    "TradeRow",
]


def __getattr__(name: str):
    """Lazy-load SupabaseStorageClient so tests of pure-Python code don't need
    `supabase` installed."""
    if name == "SupabaseStorageClient":
        from intraday_trade_spy.storage.client import SupabaseStorageClient as _C
        return _C
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
