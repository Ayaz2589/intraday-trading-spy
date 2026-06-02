from datetime import date
from enum import StrEnum
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Direction(StrEnum):
    LONG = "long"


class SignalStatus(StrEnum):
    EMITTED = "emitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTED = "executed"
    EXITED = "exited"
    FORCE_FLAT = "force_flat"
    LOCKOUT = "lockout"


class Bar(BaseModel):
    model_config = ConfigDict(frozen=True)
    symbol: Literal["SPY"]
    timestamp: AwareDatetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    session_date: date

    @model_validator(mode="after")
    def _high_gte_low(self):
        if self.high < self.low:
            raise ValueError(f"high ({self.high}) < low ({self.low})")
        return self


class IndicatorSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)
    timestamp: AwareDatetime
    vwap: float
    or_high: float | None
    or_low: float | None
    or_complete: bool
    distance_from_vwap_pct: float
    prior_bar_close: float | None


class Signal(BaseModel):
    model_config = ConfigDict(frozen=True)
    symbol: Literal["SPY"]
    setup: Literal["vwap_pullback_long"]
    direction: Direction
    timestamp: AwareDatetime
    planned_entry: float
    stop_loss: float
    take_profit: float
    reason: str

    @model_validator(mode="after")
    def _long_geometry(self):
        if not (self.stop_loss < self.planned_entry):
            raise ValueError("stop must be below entry for a long")
        if not (self.take_profit > self.planned_entry):
            raise ValueError("target must be above entry for a long")
        return self


class RiskDecision(BaseModel):
    model_config = ConfigDict(frozen=True)
    approved: bool
    reason: str
    quantity: int = 0
    planned_risk_dollars: float = 0.0


class TradePlan(BaseModel):
    model_config = ConfigDict(frozen=True)
    signal: Signal
    quantity: int
    planned_risk_dollars: float


class Position(BaseModel):
    plan: TradePlan
    entry_timestamp: AwareDatetime
    entry_price: float
    exit_timestamp: AwareDatetime | None = None
    exit_price: float | None = None
    exit_reason: Literal["stop", "target", "force_flat"] | None = None
    realized_pnl: float | None = None
    realized_r: float | None = None
    same_bar_tiebreak: Literal["none", "stop_first"] = "none"


class JournalEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    row_seq: int
    timestamp: AwareDatetime
    status: SignalStatus
    setup: str | None = None
    direction: Direction | None = None
    planned_entry: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    quantity: int | None = None
    planned_risk_dollars: float | None = None
    actual_entry: float | None = None
    actual_exit: float | None = None
    exit_reason: Literal["stop", "target", "force_flat"] | None = None
    realized_pnl: float | None = None
    realized_r: float | None = None
    vwap: float | None = None
    or_high: float | None = None
    or_low: float | None = None
    distance_from_vwap_pct: float | None = None
    prior_bar_close: float | None = None
    reason: str
    rejection_check: str | None = None
    same_bar_tiebreak: Literal["none", "stop_first"] | None = None


class DataFingerprint(BaseModel):
    model_config = ConfigDict(frozen=True)
    sha256: str
    bar_count: int
    earliest_timestamp: AwareDatetime
    latest_timestamp: AwareDatetime
    session_count: int


class SummaryMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)
    total_trades: int
    wins: int
    losses: int
    win_rate: float
    average_win_r: float
    average_loss_r: float
    average_r: float
    total_r: float
    total_pnl_dollars: float = 0.0
    profit_factor: float | None
    max_drawdown_r: float
    best_trade_r: float | None
    worst_trade_r: float | None
    longest_consecutive_loss_streak: int
    rejected_signal_count: int
    rejection_breakdown: dict[str, int] = Field(default_factory=dict)


class BacktestRun(BaseModel):
    model_config = ConfigDict(frozen=True)
    run_id: str
    run_started_at: AwareDatetime
    run_ended_at: AwareDatetime
    code_version: str
    config_snapshot: dict
    data_fingerprint: DataFingerprint
    summary: SummaryMetrics
