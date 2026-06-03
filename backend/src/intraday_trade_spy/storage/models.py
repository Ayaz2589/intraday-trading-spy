"""Pydantic row models mirroring `backend/db/migrations/*.sql`.

These models are the typed boundary between Python and Postgres. CHECK
constraints in the DB are mirrored as Pydantic validators here — caller-side
errors are caught before any network call.

Authoritative schema: `specs/005-supabase-data-layer/data-model.md`.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _utcnow() -> datetime:
    """Default-factory for auto-populated timestamps.

    Used by every row model so that `created_at` / `updated_at` are always
    explicit non-NULL values in the JSON payload. The DB column has both
    NOT NULL and DEFAULT now() — but `jsonb_populate_record` assigns NULL
    for missing keys, not the DEFAULT. Setting these at the Python boundary
    keeps the insert path simple.
    """
    return datetime.now(timezone.utc)


# ---------- Enums (mirroring DB CHECK lists) ----------

Symbol = Literal["SPY"]
Direction = Literal["LONG"]
StrategyKind = Literal["rule_based"]
Mode = Literal["backtest", "paper"]
Timeframe = Literal["5m"]
ExitReason = Literal["target", "stop", "force_flat", "timeout", "other"]
JournalKind = Literal[
    "force_flat",
    "risk_decision",
    "error",
    "lifecycle",
    "cloud_push_success",
    "cloud_push_failure",
    "other",
]
Severity = Literal["info", "warning", "error"]
RejectionReason = Literal[
    "missing_stop",
    "missing_target",
    "wrong_symbol",
    "wrong_direction",
    "daily_loss_hit",
    "max_trades_hit",
    "duplicate_signal",
    "position_size_cap",
    "stale_data",
    "opening_range_not_complete",
    "cooldown_after_loss",
    "consecutive_loss_cap",
    "no_new_trades_cutoff",
    "force_flat_window",
    "other",
]


class _Base(BaseModel):
    """Common config: forbid extras to catch typos at the boundary."""

    model_config = ConfigDict(extra="forbid", strict=False)


# ---------- strategies ----------

class StrategyRow(_Base):
    id: UUID
    key: str
    display_name: str
    description: str
    symbol: Symbol = "SPY"
    direction: Direction = "LONG"
    kind: StrategyKind = "rule_based"
    enabled: bool = True
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


# ---------- configs ----------

class ConfigParams(BaseModel):
    """JSONB body of `configs.params`.

    Passthrough container for the `backend/config/config.yaml` shape. The
    canonical structure is nested ({risk, strategy, market, ...}) — every
    field is optional and unknown keys are preserved so the YAML's full
    nested layout survives a round-trip through this model and the frontend
    StrategyConfigCard can read e.g. `params.risk.account_value` directly.

    The legacy flat fields below are retained as Optional only so old tests
    that construct ConfigParams with flat-keyword arguments still work.
    """

    model_config = ConfigDict(extra="allow")

    # Legacy flat keys (Feature 005, pre-fix). Kept Optional for backward
    # compatibility with existing tests. New code should pass the nested
    # YAML structure verbatim via `extra="allow"`.
    max_risk_per_trade: Optional[float] = None
    max_daily_loss: Optional[float] = None
    max_trades_per_day: Optional[int] = None
    max_consecutive_losses: Optional[int] = None
    cooldown_after_loss_minutes: Optional[int] = None
    no_new_trades_cutoff: Optional[str] = None
    force_flat_time: Optional[str] = None
    opening_range_minutes: Optional[int] = None
    position_value_cap: Optional[float] = None


class ConfigRow(_Base):
    id: UUID
    user_id: UUID
    strategy_id: UUID
    name: str
    mode: Mode
    live_auto_enabled: bool = False
    timeframe: Timeframe = "5m"
    params: ConfigParams
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    @field_validator("live_auto_enabled")
    @classmethod
    def _live_must_be_false(cls, v: bool) -> bool:
        # Constitution V: live trading disabled by default; in v1 the DB CHECK
        # pins this FALSE, but we also catch it here for clearer errors.
        if v is not False:
            raise ValueError(
                "live_auto_enabled may not be True in v1 (constitution principle V)"
            )
        return v


# ---------- runs ----------

class RunSummary(_Base):
    """JSONB body of `runs.summary`."""

    pnl: Decimal
    win_rate: float = Field(ge=0.0, le=1.0)
    sharpe: float
    max_drawdown: Decimal  # legacy R units — unchanged (Feature 010 / I1)
    total_trades: int = Field(ge=0)
    total_signals: int = Field(ge=0)
    rejected_signals: int = Field(ge=0)
    # ---- Feature 010 (honest backtest): new scalar headline metrics ----
    # `max_drawdown` stays R; these are the net-of-cost $/% drawdowns + the
    # edge-quality + significance figures. JSONB → additive, no migration.
    sortino: float = 0.0
    expectancy: float = 0.0
    expectancy_dollars: Decimal = Decimal("0")
    max_drawdown_dollars: Decimal = Decimal("0")
    max_drawdown_pct: float = 0.0
    total_fees: Decimal = Decimal("0")
    total_slippage: Decimal = Decimal("0")
    low_confidence: bool = False
    win_rate_ci_low: float = 0.0
    win_rate_ci_high: float = 0.0


class RunRow(_Base):
    id: UUID
    user_id: UUID
    config_id: UUID
    strategy_id: UUID
    started_at: datetime
    finished_at: datetime
    status: Literal["queued", "running", "finished", "failed"] = "finished"
    status_updated_at: datetime = Field(default_factory=_utcnow)
    failure_reason: Optional[str] = None
    range_start: date
    range_end: date
    bar_count: int = Field(gt=0)
    summary: RunSummary
    data_fingerprint: str
    app_version: str
    is_favorite: bool = False
    created_at: datetime = Field(default_factory=_utcnow)

    @model_validator(mode="after")
    def _range_end_gte_start(self) -> "RunRow":
        if self.range_end < self.range_start:
            raise ValueError("range_end must be >= range_start")
        return self


# ---------- trades ----------

class TradeRow(_Base):
    id: UUID
    run_id: UUID
    user_id: UUID
    direction: Direction = "LONG"
    quantity: Decimal = Field(gt=Decimal(0))
    entry_at: datetime
    entry_price: Decimal = Field(gt=Decimal(0))
    stop_price: Decimal = Field(gt=Decimal(0))     # NOT NULL per Constitution III
    target_price: Decimal = Field(gt=Decimal(0))   # NOT NULL per Constitution III
    exit_at: datetime
    exit_price: Decimal = Field(gt=Decimal(0))
    exit_reason: ExitReason
    pnl: Decimal
    r_multiple: Decimal
    created_at: datetime = Field(default_factory=_utcnow)


# ---------- signals ----------

class SignalIndicatorContext(_Base):
    """JSONB body of `signals.indicator_context`."""

    vwap: Decimal
    opening_range_high: Decimal
    opening_range_low: Decimal
    bar_open: Decimal
    bar_high: Decimal
    bar_low: Decimal
    bar_close: Decimal
    bar_volume: int


class SignalRow(_Base):
    id: UUID
    run_id: UUID
    user_id: UUID
    emitted_at: datetime
    direction: Direction = "LONG"
    entry_price: Decimal = Field(gt=Decimal(0))
    stop_price: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    executed: bool
    rejection_reason: Optional[RejectionReason] = None
    trade_id: Optional[UUID] = None
    indicator_context: SignalIndicatorContext
    reason_text: str
    created_at: datetime = Field(default_factory=_utcnow)

    @model_validator(mode="after")
    def _executed_xor_rejected(self) -> "SignalRow":
        if self.executed:
            if self.rejection_reason is not None:
                raise ValueError("executed signal cannot carry a rejection_reason")
            if self.trade_id is None:
                raise ValueError("executed signal must reference a trade_id")
        else:
            if self.rejection_reason is None:
                raise ValueError("rejected signal must carry a rejection_reason")
            if self.trade_id is not None:
                raise ValueError("rejected signal cannot reference a trade_id")
        return self


# ---------- journal_events ----------

class JournalEventDetails(_Base):
    """JSONB body of `journal_events.details`. Open-shape; concrete sub-models can come later."""

    model_config = ConfigDict(extra="allow")


class JournalEventRow(_Base):
    id: UUID
    run_id: Optional[UUID] = None
    user_id: UUID
    occurred_at: datetime
    kind: JournalKind
    severity: Severity = "info"
    message: str
    details: JournalEventDetails = Field(default_factory=JournalEventDetails)
    created_at: datetime = Field(default_factory=_utcnow)


# ---------- bars ----------

class BarRow(_Base):
    id: UUID
    bar_start: datetime
    open: Decimal = Field(gt=Decimal(0))
    high: Decimal = Field(gt=Decimal(0))
    low: Decimal = Field(gt=Decimal(0))
    close: Decimal = Field(gt=Decimal(0))
    volume: int = Field(ge=0)
    source: str = "yfinance"
    created_at: datetime = Field(default_factory=_utcnow)


# ---------- composite push payload ----------

class PushRunPayload(_Base):
    """Atomic push body for `supabase.rpc('push_run', ...)`.

    Pydantic validates structure + user_id consistency BEFORE any HTTP call —
    bad payloads fail with clearer errors than the DB would emit.
    """

    run: RunRow
    trades: list[TradeRow] = Field(default_factory=list)
    signals: list[SignalRow] = Field(default_factory=list)
    journal_events: list[JournalEventRow] = Field(default_factory=list)

    @model_validator(mode="after")
    def _user_id_consistency(self) -> "PushRunPayload":
        run_user = self.run.user_id
        for t in self.trades:
            if t.user_id != run_user:
                raise ValueError(f"trade {t.id} user_id mismatch with run user_id")
        for s in self.signals:
            if s.user_id != run_user:
                raise ValueError(f"signal {s.id} user_id mismatch with run user_id")
        for e in self.journal_events:
            if e.user_id != run_user:
                raise ValueError(f"journal_event {e.id} user_id mismatch with run user_id")
        return self
