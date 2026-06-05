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
    # Feature 010 (honest backtest): cost transparency. `realized_pnl` is the
    # NET figure (gross − fees); these break it down. Slippage is already baked
    # into entry/exit fill prices; `slippage_cost` reports its dollar magnitude.
    gross_pnl: float | None = None
    fees: float | None = None
    slippage_cost: float | None = None


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
    # Feature 010: per-trade cost breakdown (constitution VII). realized_pnl is
    # net; these explain the deduction in the journal and CSV export.
    gross_pnl: float | None = None
    fees: float | None = None
    slippage_cost: float | None = None


class DataFingerprint(BaseModel):
    model_config = ConfigDict(frozen=True)
    sha256: str
    bar_count: int
    earliest_timestamp: AwareDatetime
    latest_timestamp: AwareDatetime
    session_count: int


class EquityPoint(BaseModel):
    """Feature 010: one point on the net-PnL equity curve. The seed point has a
    null timestamp and equals the starting account value."""

    model_config = ConfigDict(frozen=True)
    timestamp: AwareDatetime | None = None
    equity: float
    cumulative_net_pnl: float


class Bucket(BaseModel):
    """Feature 010: per-bucket performance (hour-of-day / weekday / month)."""

    model_config = ConfigDict(frozen=True)
    key: str
    trade_count: int
    net_pnl_dollars: float
    win_rate: float | None = None
    expectancy_r: float | None = None


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
    # ---- Feature 010 (honest backtest): net cost aggregates ----
    total_net_pnl_dollars: float = 0.0
    total_fees_dollars: float = 0.0
    total_slippage_dollars: float = 0.0
    # ---- edge-quality metrics (computed over net results) ----
    expectancy_r: float | None = None
    expectancy_dollars: float | None = None
    sharpe: float | None = None
    sortino: float | None = None
    max_drawdown_dollars: float = 0.0
    max_drawdown_pct: float | None = None
    return_median_dollars: float | None = None
    return_std_dollars: float | None = None
    return_skew: float | None = None
    # ---- significance ----
    win_rate_ci_low: float | None = None
    win_rate_ci_high: float | None = None
    low_confidence: bool = False
    # ---- equity curve + per-bucket breakdown ----
    equity_curve: list[EquityPoint] = Field(default_factory=list)
    hour_buckets: list[Bucket] = Field(default_factory=list)
    weekday_buckets: list[Bucket] = Field(default_factory=list)
    month_buckets: list[Bucket] = Field(default_factory=list)


class BacktestRun(BaseModel):
    model_config = ConfigDict(frozen=True)
    run_id: str
    run_started_at: AwareDatetime
    run_ended_at: AwareDatetime
    code_version: str
    config_snapshot: dict
    data_fingerprint: DataFingerprint
    summary: SummaryMetrics


# ---- Feature 011 (Phase 2 — validation engine) result value objects --------


class WindowMetrics(BaseModel):
    """The subset of SummaryMetrics compared across walk-forward windows /
    sensitivity points. Carries the child run_id for drill-down."""

    model_config = ConfigDict(frozen=True)
    segment: Literal["train", "validation", "lockbox"]
    range_start: date
    range_end: date
    run_id: str
    # Feature 014: True when run_id refers to a stored, drillable run (successful
    # push or dedup hit). Default False ⇒ pre-014 results and failed pushes both
    # read as not-drillable — one mechanism gates every UI link (FR-007).
    persisted: bool = False
    total_trades: int
    expectancy_dollars: float | None
    expectancy_r: float | None
    win_rate: float
    profit_factor: float | None
    sharpe: float | None
    total_net_pnl_dollars: float
    low_confidence: bool


class WalkForwardWindowResult(BaseModel):
    model_config = ConfigDict(frozen=True)
    window_index: int
    in_sample: WindowMetrics
    out_of_sample: WindowMetrics
    # OOS − IS per compared metric; None where either side is undefined.
    gap: dict[str, float | None]


class WalkForwardResult(BaseModel):
    model_config = ConfigDict(frozen=True)
    mode: Literal["rolling", "anchored"]
    train_months: int
    step_months: int
    validation_months: int
    windows: list[WalkForwardWindowResult]
    mean_oos: dict[str, float | None]
    mean_gap: dict[str, float | None]


class SensitivityPoint(BaseModel):
    model_config = ConfigDict(frozen=True)
    coords: dict[str, float]          # {dotted_knob_path: value}
    metric: float | None
    trade_count: int
    low_confidence: bool
    run_id: str
    # Feature 014: same drillability semantics as WindowMetrics.persisted.
    persisted: bool = False


class SensitivitySurface(BaseModel):
    model_config = ConfigDict(frozen=True)
    metric_name: str
    knobs: list[str]                  # 1 or 2 dotted paths (axis order)
    axes: dict[str, list[float]]      # knob -> ordered value list
    points: list[SensitivityPoint]
    segment: Literal["train", "validation", "train_validation"]


class BootstrapCI(BaseModel):
    model_config = ConfigDict(frozen=True)
    statistic: str                    # expectancy_dollars | expectancy_r | sharpe
    point: float | None
    low: float | None
    high: float | None


class SignificanceResult(BaseModel):
    model_config = ConfigDict(frozen=True)
    confidence: float
    bootstrap: list[BootstrapCI]
    permutation_metric: str
    observed: float
    p_value: float | None
    alpha: float
    significant: bool
    bootstrap_iterations: int
    permutation_iterations: int
    seed: int


# ---- Feature 016 (advisory Claude narrative) --------------------------------


class ClaudeFinding(BaseModel):
    """One claim with the payload metric that backs it. The UI renders the
    cited metric's value FROM OUR DATA beside the claim — a metric absent
    from the payload renders as visibly unverifiable (no number laundering)."""

    model_config = ConfigDict(frozen=True)
    claim: str
    evidence_metric: str
    confidence: Literal["low", "medium", "high"]


class ClaudeExperiment(BaseModel):
    model_config = ConfigDict(frozen=True)
    hypothesis: str
    how_to_test: str


class ClaudeAnalysis(BaseModel):
    """The structured advisory output — also the output_format schema passed
    to client.messages.parse(). Experiments are for the OPERATOR to run; the
    LLM never trades or tunes (Principle II boundary)."""

    model_config = ConfigDict(frozen=True)
    summary: str
    findings: list[ClaudeFinding]
    risks: list[str]
    suggested_experiments: list[ClaudeExperiment]


# ---- Feature 016 (pooled study gate) result value objects -------------------


class CIStat(BaseModel):
    """A bootstrap point estimate with its confidence interval."""

    model_config = ConfigDict(frozen=True)
    point: float | None
    low: float | None
    high: float | None


class PerWindowP(BaseModel):
    model_config = ConfigDict(frozen=True)
    window_index: int
    p_value: float | None
    significant: bool


class FisherStat(BaseModel):
    model_config = ConfigDict(frozen=True)
    x2: float
    df: int
    p: float


class PooledGateResult(BaseModel):
    """The pre-registered lockbox gate over a walk-forward study's pooled
    OOS windows. passed iff expectancy_dollars_ci.low > 0 (strict). Fast mode
    omits per_window_p/fisher; full mode fills them. computed_at is stamped by
    the lifecycle at persistence time (the engine output stays deterministic)."""

    model_config = ConfigDict(frozen=True)
    computed_at: str | None = None
    mode: Literal["fast", "full"]
    passed: bool
    alpha: float
    pooled_trades: int
    windows_total: int
    windows_with_trades: int
    windows_positive: int
    total_net_pnl_dollars: float
    expectancy_dollars_ci: CIStat
    expectancy_r_ci: CIStat
    sign_test_p: float
    monte_carlo: "MonteCarloResult"
    per_window_p: list[PerWindowP] | None = None
    fisher: FisherStat | None = None
    seed: int


# ---- Feature 015 (Monte Carlo path-risk) result value objects --------------


class MonteCarloDistribution(BaseModel):
    """One statistic's simulated distribution vs. the observed (actual-order)
    value. Percentiles via np.percentile (linear interpolation)."""

    model_config = ConfigDict(frozen=True)
    observed: float
    p5: float
    p25: float
    p50: float
    p75: float
    p95: float


class MonteCarloShuffleStats(BaseModel):
    """Path-dependent stats across reorderings of the exact observed trades.
    Drawdown pct is a FRACTION of the running peak (metrics.py convention)."""

    model_config = ConfigDict(frozen=True)
    max_drawdown_pct: MonteCarloDistribution
    max_drawdown_dollars: MonteCarloDistribution
    longest_losing_streak: MonteCarloDistribution
    longest_underwater_trades: MonteCarloDistribution


class MonteCarloConeStep(BaseModel):
    """Equity percentile bands at one trade index of the bootstrap horizon.
    Invariant: p5 <= p25 <= p50 <= p75 <= p95 (FR-013)."""

    model_config = ConfigDict(frozen=True)
    trade_index: int
    p5: float
    p25: float
    p50: float
    p75: float
    p95: float


class MonteCarloCone(BaseModel):
    """Forward projection: paths drawn with replacement from the observed
    trades. Steps are downsampled to <= max_cone_steps at evenly spaced
    indices (first and final always included); sampled values are computed on
    the full-resolution paths (research.md R7)."""

    model_config = ConfigDict(frozen=True)
    horizon_trades: int
    steps: list[MonteCarloConeStep]


class MonteCarloRuinPoint(BaseModel):
    """Fraction of bootstrap paths whose equity dipped below starting equity
    by at least threshold_pct at any point during the horizon. Monotone
    non-increasing in threshold depth (FR-013)."""

    model_config = ConfigDict(frozen=True)
    threshold_pct: float
    probability: float


class MonteCarloResult(BaseModel):
    """On-demand, deterministic, never persisted (FR-005/FR-006/FR-011): the
    echoed seed/iterations/trade_count regenerate every number exactly."""

    model_config = ConfigDict(frozen=True)
    shuffle: MonteCarloShuffleStats
    cone: MonteCarloCone
    # observed = the run's actual ending equity (start + sum of real PnLs).
    terminal_equity: MonteCarloDistribution
    ruin: list[MonteCarloRuinPoint]
    iterations: int
    seed: int
    trade_count: int
    starting_equity: float
    low_confidence: bool
