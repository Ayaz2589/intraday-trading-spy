"""Pydantic API request/response schemas (Feature 006).

Distinct from `intraday_trade_spy.storage.models` (the DB-row models). API
schemas may omit internal fields and rename for clarity. They enforce
constitutional invariants at the boundary (no `symbol`, no `live_auto_enabled`,
no `direction` etc. accepted from clients).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class _Base(BaseModel):
    """Strict by default — used for REQUEST bodies. Response views relax this."""

    model_config = ConfigDict(extra="forbid")


class _ResponseBase(BaseModel):
    """Response views ignore extra DB columns so internal projections don't
    need to be manually pruned. Clients only see the declared fields."""

    model_config = ConfigDict(extra="ignore")


# ---------- Request bodies ----------


class StartBacktestRequest(_Base):
    config_name: str = Field(min_length=1, max_length=200)
    data_csv_path: Optional[str] = None
    # Optional explicit date range. When supplied, the lifecycle materializes
    # a CSV from the shared bars cache (auto-fetching from yfinance for any
    # missing trading days) and uses that as the backtest input — overriding
    # both `data_csv_path` and the YAML's default `data.csv_path`.
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    @model_validator(mode="before")
    @classmethod
    def _reject_forbidden_fields(cls, data):
        if not isinstance(data, dict):
            return data
        forbidden = {"symbol", "direction", "live_auto_enabled", "kind"}
        intersect = forbidden & data.keys()
        if intersect:
            raise ValueError(
                f"forbidden fields not accepted from clients (constitution I/II/V): {sorted(intersect)}"
            )
        return data

    @model_validator(mode="after")
    def _range_valid(self) -> "StartBacktestRequest":
        if (self.start_date is None) != (self.end_date is None):
            raise ValueError("start_date and end_date must be supplied together")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class StartDataDownloadRequest(_Base):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _range_valid(self) -> "StartDataDownloadRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        if (self.end_date - self.start_date).days > 60:
            raise ValueError("date range may not exceed 60 days")
        return self


# ---------- Response bodies ----------


class StartBacktestResponse(_ResponseBase):
    run_id: UUID
    status: Literal["queued"]


class StartDataDownloadResponse(_ResponseBase):
    job_id: UUID
    status: Literal["queued"]


RunStatusLiteral = Literal["queued", "running", "finished", "failed"]


class RunSummaryView(_ResponseBase):
    # Defaults handle legacy rows from Feature 005/006 testing that were
    # finalized with summary = {} before the full schema was wired up.
    pnl: Decimal = Decimal("0")
    win_rate: float = 0.0
    sharpe: float = 0.0
    max_drawdown: Decimal = Decimal("0")  # legacy R units (Feature 010 / I1)
    total_trades: int = 0
    total_signals: int = 0
    rejected_signals: int = 0
    # Feature 010 (honest backtest): new scalar metrics; default safely so
    # pre-010 rows still deserialize.
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


class RunView(_ResponseBase):
    id: UUID
    started_at: datetime
    finished_at: datetime
    status: RunStatusLiteral
    range_start: date
    range_end: date
    bar_count: int
    summary: RunSummaryView
    data_fingerprint: str
    app_version: str
    is_favorite: bool = False
    failure_reason: Optional[str] = None


class RunListResponse(_ResponseBase):
    runs: list[RunView]
    next_cursor: Optional[str] = None


class RunStatusResponse(_ResponseBase):
    status: RunStatusLiteral
    status_updated_at: datetime
    failure_reason: Optional[str] = None


class TradeView(_ResponseBase):
    id: UUID
    direction: Literal["LONG"]
    quantity: Decimal
    entry_at: datetime
    entry_price: Decimal
    stop_price: Decimal
    target_price: Decimal
    exit_at: datetime
    exit_price: Decimal
    exit_reason: str
    pnl: Decimal
    r_multiple: Decimal


class TradeListResponse(_ResponseBase):
    trades: list[TradeView]
    next_cursor: Optional[str] = None


class SignalView(_ResponseBase):
    id: UUID
    emitted_at: datetime
    direction: Literal["LONG"]
    entry_price: Decimal
    stop_price: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    executed: bool
    rejection_reason: Optional[str] = None
    trade_id: Optional[UUID] = None
    indicator_context: dict
    reason_text: str


class SignalListResponse(_ResponseBase):
    signals: list[SignalView]
    next_cursor: Optional[str] = None


class JournalEventView(_ResponseBase):
    id: UUID
    occurred_at: datetime
    kind: str
    severity: Literal["info", "warning", "error"]
    message: str
    details: dict = Field(default_factory=dict)


class JournalListResponse(_ResponseBase):
    events: list[JournalEventView]
    next_cursor: Optional[str] = None


class BarView(_ResponseBase):
    symbol: Literal["SPY"] = "SPY"
    timestamp: datetime = Field(validation_alias="bar_start")
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class BarListResponse(_ResponseBase):
    bars: list[BarView]


class ConfigView(_ResponseBase):
    id: UUID
    name: str
    mode: Literal["backtest", "paper"]
    timeframe: Literal["5m"]
    strategy_id: UUID
    params: dict
    is_active: bool = False  # Feature 012


class StrategyView(_ResponseBase):
    key: str
    display_name: str
    description: str
    symbol: Literal["SPY"]
    direction: Literal["LONG"]
    kind: Literal["rule_based"]
    enabled: bool


class StrategyListResponse(_ResponseBase):
    strategies: list[StrategyView]


class RunManifestView(_ResponseBase):
    strategy: StrategyView
    config: ConfigView


class DataDownloadJobView(_ResponseBase):
    id: UUID
    start_date: date
    end_date: date
    status: RunStatusLiteral
    storage_path: Optional[str] = None
    status_updated_at: datetime
    failure_reason: Optional[str] = None


class HealthResponse(_ResponseBase):
    status: Literal["ok"]
    db: Literal["ok", "unreachable"]


# ---------- Feature 011: validation studies ----------


class StartStudyRequest(_Base):
    # US1 walk_forward + US2 sensitivity; lockbox (US4) uses its own endpoint.
    kind: Literal["walk_forward", "sensitivity"]
    config_name: str = Field(min_length=1, max_length=200)
    # walk_forward: optional overrides (mode / train_months / step_months /
    # validation_months); unset → config.yaml defaults.
    walk_forward: Optional[dict] = None
    # sensitivity: a grid of 1-2 knobs ({knob: dotted.path, values: [...]}), an
    # optional metric (default from config), and the segment to evaluate over.
    grid: Optional[list[dict]] = None
    metric: Optional[str] = None
    segment: Optional[Literal["train", "validation", "train_validation"]] = None
    # Required true to launch a study whose planned evaluations exceed the
    # configured fan-out guard (no silent unbounded fan-out).
    confirm_large: bool = False

    @model_validator(mode="before")
    @classmethod
    def _reject_forbidden_fields(cls, data):
        if not isinstance(data, dict):
            return data
        forbidden = {"symbol", "direction", "live_auto_enabled"} & data.keys()
        if forbidden:
            raise ValueError(
                f"forbidden fields not accepted from clients (constitution I/II/V): {sorted(forbidden)}"
            )
        return data

    @model_validator(mode="after")
    def _kind_requires_fields(self) -> "StartStudyRequest":
        if self.kind == "sensitivity" and not self.grid:
            raise ValueError("sensitivity studies require a non-empty `grid`")
        return self


class StartStudyResponse(_ResponseBase):
    study_id: UUID
    status: Literal["queued"]
    planned_evaluations: int


class SignificanceRequest(_Base):
    run_id: UUID


class LockboxRunRequest(_Base):
    config_name: str = Field(min_length=1, max_length=200)
    override: bool = False


class LockboxRunResponse(_ResponseBase):
    state: Literal["spent", "burned"]
    contaminated: bool
    config_fingerprint: str
    run_id: Optional[UUID] = None
    summary: dict


class LockboxStatusView(_ResponseBase):
    lockbox_start: date
    lockbox_end: date
    state: Literal["unspent", "spent", "burned"]
    config_fingerprint: Optional[str] = None
    run_id: Optional[UUID] = None
    result: Optional[dict] = None
    history: list[dict] = []


class ValidationStudyView(_ResponseBase):
    id: UUID
    kind: str
    status: RunStatusLiteral
    progress_completed: int
    progress_total: int
    result: Optional[dict] = None
    failure_reason: Optional[str] = None
    created_at: datetime


class ValidationStudyStatusView(_ResponseBase):
    id: UUID
    status: RunStatusLiteral
    progress_completed: int
    progress_total: int
    failure_reason: Optional[str] = None


class StudyListResponse(_ResponseBase):
    studies: list[ValidationStudyView]
    next_cursor: Optional[str] = None


# ---------- Feature 012: config management ----------


class ConfigCreateRequest(_Base):
    name: str = Field(min_length=1, max_length=200)
    source: Literal["scratch", "preset", "duplicate"] = "scratch"
    preset_name: Optional[str] = None      # required when source == "preset"
    from_config_id: Optional[UUID] = None  # required when source == "duplicate"

    @model_validator(mode="before")
    @classmethod
    def _reject_forbidden_fields(cls, data):
        if not isinstance(data, dict):
            return data
        forbidden = {"symbol", "direction", "live_auto_enabled"} & data.keys()
        if forbidden:
            raise ValueError(
                f"forbidden fields not accepted from clients (constitution I/II/V): {sorted(forbidden)}"
            )
        return data

    @model_validator(mode="after")
    def _source_requires_field(self) -> "ConfigCreateRequest":
        if self.source == "preset" and not self.preset_name:
            raise ValueError("source='preset' requires preset_name")
        if self.source == "duplicate" and not self.from_config_id:
            raise ValueError("source='duplicate' requires from_config_id")
        return self


class ConfigDuplicateRequest(_Base):
    name: str = Field(min_length=1, max_length=200)


class ConfigMutateRequest(_Base):
    """PATCH body — rename and/or edit knobs. At least one field required."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    params: Optional[dict] = None

    @model_validator(mode="after")
    def _at_least_one(self) -> "ConfigMutateRequest":
        if self.name is None and self.params is None:
            raise ValueError("PATCH requires `name` and/or `params`")
        return self


class PresetView(_ResponseBase):
    name: str
    description: str
    params: dict


class PresetListResponse(_ResponseBase):
    presets: list[PresetView]
