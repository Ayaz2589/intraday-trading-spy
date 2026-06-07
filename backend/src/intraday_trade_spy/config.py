from datetime import date
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, model_validator


class AppConfig(BaseModel):
    name: str = "intraday-trade-spy"
    timezone: Literal["America/New_York"] = "America/New_York"
    mode: Literal["backtest"] = "backtest"


class MarketConfig(BaseModel):
    symbol: Literal["SPY"]
    session_start: str
    session_end: str
    no_new_trades_after: str
    force_flat_time: str


class RegimeWindow(BaseModel):
    """A labeled historical market regime used as the yardstick for
    multi-regime data coverage (Feature 009)."""

    name: str
    start: date
    end: date


class DataConfig(BaseModel):
    timeframe: Literal["5m"] = "5m"
    csv_path: str
    output_dir: str
    require_regular_session_only: bool = True
    # Feature 009: cross-source read precedence — first listed source wins when
    # multiple sources cached the same timestamp.
    source_preference: list[str] = Field(
        default_factory=lambda: ["alpaca", "yfinance"]
    )
    # A regime is "covered" when this fraction of its expected NYSE trading
    # sessions are present in the cache.
    regime_covered_threshold_pct: float = 90.0
    regimes: list[RegimeWindow] = Field(default_factory=list)


class OpeningRangeConfig(BaseModel):
    minutes: int = 15


class VwapPullbackStopConfig(BaseModel):
    type: Literal["below_pullback_low"] = "below_pullback_low"
    buffer_pct: float = 0.05


class VwapPullbackTargetConfig(BaseModel):
    risk_reward: float = 2.0


class EntryWindowConfig(BaseModel):
    """Feature 020: entries allowed only inside [start, end) minutes after the
    09:30 ET open. Defaults reproduce pre-020 behavior exactly — this is the
    deliberate, validated, journaled re-introduction of the concept feature
    010 removed for being parsed-but-never-read."""

    start_minutes_after_open: int = Field(default=0, ge=0, le=390)
    end_minutes_after_open: int = Field(default=390, ge=0, le=390)

    @model_validator(mode="after")
    def _window_not_empty(self) -> "EntryWindowConfig":
        if self.start_minutes_after_open >= self.end_minutes_after_open:
            raise ValueError(
                "entry window is empty: start_minutes_after_open="
                f"{self.start_minutes_after_open} must be < "
                f"end_minutes_after_open={self.end_minutes_after_open}"
            )
        return self


class VwapPullbackConfig(BaseModel):
    # Feature 010: removed `min_minutes_after_open` and the `confirmation` block
    # (`require_close_above_prior_bar_high`, `require_close_above_vwap`) — they
    # were parsed but never read by the strategy (the VWAP and prior-bar
    # confirmations are hardcoded in vwap_pullback.py). Deleting them keeps the
    # config honest; re-introduce as deliberate, validated knobs if ever needed.
    max_distance_from_vwap_pct: float = 0.25
    stop: VwapPullbackStopConfig = Field(default_factory=VwapPullbackStopConfig)
    target: VwapPullbackTargetConfig = Field(default_factory=VwapPullbackTargetConfig)
    entry_window: EntryWindowConfig = Field(default_factory=EntryWindowConfig)


class StrategyConfig(BaseModel):
    enabled: bool = True
    allowed_directions: list[Literal["long"]] = Field(default_factory=lambda: ["long"])
    enabled_setup: Literal["vwap_pullback_long"] = "vwap_pullback_long"
    opening_range: OpeningRangeConfig = Field(default_factory=OpeningRangeConfig)
    vwap_pullback: VwapPullbackConfig = Field(default_factory=VwapPullbackConfig)


class RiskConfig(BaseModel):
    account_value: float = 1000.0
    max_risk_per_trade_pct: float = 1.0
    max_daily_loss_pct: float = 2.0
    max_trades_per_day: int = 3
    max_consecutive_losses: int = 2
    cooldown_after_loss_minutes: int = 30
    max_position_value_pct: float = 25.0
    require_stop_loss: bool = True
    require_take_profit: bool = True
    allow_overnight_positions: bool = False


class BrokerConfig(BaseModel):
    provider: Literal["paper"] = "paper"
    live_auto_enabled: Literal[False] = False
    # Feature 010: costs are applied to every fill. Alpaca equities are
    # commission-free (fees 0); slippage is a fixed adverse amount per share
    # applied on both entry and exit. Non-zero default => net-of-cost by default.
    fees_per_share: float = 0.0
    slippage_per_share: float = 0.01


class MetricsConfig(BaseModel):
    """Feature 010: governs the risk-adjusted + significance metrics so no
    magic numbers live in source."""

    trading_days_per_year: int = 252
    risk_free_rate: float = 0.0
    win_rate_ci_confidence: float = 0.95
    low_confidence_trade_count: int = 30


class AlpacaConfig(BaseModel):
    """Alpaca market-data settings (Feature 009). Credentials come from env,
    never here. Free tier serves the IEX feed."""

    feed: Literal["iex", "sip"] = "iex"


# ---- Feature 011 (Phase 2 — validation engine) ----------------------------
# Defaults mirror config.yaml (the MetricsConfig precedent): the authoritative
# values live in config.yaml and override these. No validation *logic* hardcodes
# dates or thresholds — it reads them from here.


class SplitWindowConfig(BaseModel):
    start: date
    end: date


class SplitConfig(BaseModel):
    """Train / validation / lockbox segments. The lockbox is the most-recent
    slice (closest to forward / out-of-sample-by-construction) and is held out
    until the one-shot test."""

    train: SplitWindowConfig = Field(
        default_factory=lambda: SplitWindowConfig(
            start=date(2018, 1, 1), end=date(2022, 12, 31)
        )
    )
    validation: SplitWindowConfig = Field(
        default_factory=lambda: SplitWindowConfig(
            start=date(2023, 1, 1), end=date(2024, 12, 31)
        )
    )
    lockbox: SplitWindowConfig = Field(
        default_factory=lambda: SplitWindowConfig(
            start=date(2025, 1, 1), end=date(2026, 12, 31)
        )
    )


class WalkForwardConfig(BaseModel):
    mode: Literal["rolling", "anchored"] = "rolling"
    train_months: int = 12
    step_months: int = 6
    validation_months: int = 6
    # Absolute expectancy-R gap (|OOS − IS|) beyond which a window is flagged as
    # likely overfit in the UI. Provisional default — finalized in task T067.
    overfit_gap_warn: float = 0.10


class SensitivityConfig(BaseModel):
    default_metric: str = "expectancy_dollars"


class SignificanceConfig(BaseModel):
    bootstrap_iterations: int = 1000
    permutation_iterations: int = 1000
    confidence: float = 0.95
    alpha: float = 0.05
    seed: int = 20260603


class MonteCarloConfig(BaseModel):
    """Feature 015: Monte Carlo path-risk parameters. One `iterations` knob
    drives both the shuffle and bootstrap methods; all randomness is seeded so
    identical inputs+config yield byte-identical results."""

    iterations: int = 2000
    seed: int = 20260604
    ruin_thresholds_pct: list[float] = Field(default_factory=lambda: [5, 10, 20])
    # None -> horizon matches the run's observed trade count.
    horizon_trades: int | None = None
    max_cone_steps: int = 200


class PooledGateConfig(BaseModel):
    """Feature 016: the pooled study gate — pre-registered lockbox precondition.
    Verdict rule: passed iff the pooled expectancy-$ CI low (at 1 - alpha)
    is strictly > 0. Seeded so the verdict is byte-identical on recompute."""

    alpha: float = 0.05
    seed: int = 20260605


class ValidationConfig(BaseModel):
    split: SplitConfig = Field(default_factory=SplitConfig)
    walk_forward: WalkForwardConfig = Field(default_factory=WalkForwardConfig)
    sensitivity: SensitivityConfig = Field(default_factory=SensitivityConfig)
    significance: SignificanceConfig = Field(default_factory=SignificanceConfig)
    monte_carlo: MonteCarloConfig = Field(default_factory=MonteCarloConfig)
    pooled_gate: PooledGateConfig = Field(default_factory=PooledGateConfig)
    # Single canonical fan-out guard (resolves analyze finding D1): the total
    # planned evaluations (grid points × windows) beyond which a study launch
    # requires explicit confirmation.
    max_evaluations_warn: int = 200


# ---- Feature 016 (insights / advisory Claude narrative) --------------------


class InsightsClaudeConfig(BaseModel):
    """Advisory LLM narrative knobs. The model is a config choice (not code);
    the truncation cap keeps oversized archives from inflating payloads."""

    model: str = "claude-opus-4-8"
    max_tokens: int = 8000
    max_timeseries_windows: int = 200


class InsightsHealthConfig(BaseModel):
    """Feature 018 (FR-003): config health verdict thresholds. The verdict is
    a pure function of the OOS archive + these published values — the engine
    reads them here, never literals."""

    min_windows: int = 6              # evidence floor — below: insufficient_evidence
    recent_windows: int = 4           # the "recent" comparison window count
    degradation_margin_r: float = 0.02  # R-units margin before degrading fires


class InsightsRecommendConfig(BaseModel):
    """Feature 018: deterministic candidate-generation knobs."""

    min_improvement_r: float = 0.01  # improvement required to suggest a delta
    min_shared_windows: int = 4      # matched windows for cross-config transfer
    max_candidates: int = 5          # ranked knob-delta candidates surfaced


class InsightsConfig(BaseModel):
    claude: InsightsClaudeConfig = Field(default_factory=InsightsClaudeConfig)
    health: InsightsHealthConfig = Field(default_factory=InsightsHealthConfig)
    recommend: InsightsRecommendConfig = Field(default_factory=InsightsRecommendConfig)


# ---- Feature 019 (automated strategy research) ------------------------------


class ResearchConfig(BaseModel):
    """Campaign stopping thresholds (FR-006): published config, never code
    constants. The cycle gate's bar level is 1 - base_alpha/k where k is the
    knob family's recorded trial count."""

    default_budget: int = Field(default=6, ge=0)
    base_alpha: float = Field(default=0.05, gt=0, le=0.5)
    backfill_start: str = "2018-01-01"  # full-span auto-backfill (empty cache)


# ---- Feature 021 (live paper trading) ----------------------------------------


class PaperConfig(BaseModel):
    """Thresholds for the live paper-trading loop (/trade). Constitution:
    config-resident, never hardcoded."""

    stale_data_seconds: int = Field(default=120, ge=1)
    reconcile_seconds: int = Field(default=5, ge=1)
    warmup_lookback_days: int = Field(default=1, ge=1)
    chart_30d_days: int = Field(default=30, ge=1)


# ---- Feature 022 (historic trade replay) ------------------------------------


class ReplayConfig(BaseModel):
    """Historic-replay playback knobs (/trade/historic). `speeds` are the
    selectable settings, each = simulated market-seconds elapsed per one real
    second (1 = real-time … 3600 = a full session in ~7s). UI-presentation
    values kept here so no magic numbers live in source. `default_speed` must
    be one of `speeds`."""

    speeds: list[int] = Field(
        default_factory=lambda: [1, 10, 30, 60, 300, 600, 1800, 3600]
    )
    default_speed: int = 60

    @model_validator(mode="after")
    def _default_in_speeds(self) -> "ReplayConfig":
        if self.default_speed not in self.speeds:
            raise ValueError(
                f"replay.default_speed={self.default_speed} must be one of "
                f"replay.speeds={self.speeds}"
            )
        return self


class Config(BaseModel):
    app: AppConfig = Field(default_factory=AppConfig)
    market: MarketConfig
    data: DataConfig
    strategy: StrategyConfig = Field(default_factory=StrategyConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    broker: BrokerConfig = Field(default_factory=BrokerConfig)
    metrics: MetricsConfig = Field(default_factory=MetricsConfig)
    alpaca: AlpacaConfig = Field(default_factory=AlpacaConfig)
    validation: ValidationConfig = Field(default_factory=ValidationConfig)
    insights: InsightsConfig = Field(default_factory=InsightsConfig)
    research: ResearchConfig = Field(default_factory=ResearchConfig)
    paper: PaperConfig = Field(default_factory=PaperConfig)
    replay: ReplayConfig = Field(default_factory=ReplayConfig)


def load_config(path: str | Path) -> Config:
    raw = yaml.safe_load(Path(path).read_text())
    return Config.model_validate(raw)


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge `override` onto `base`. Nested dicts merge key-by-key;
    any non-dict value (or a key absent from base) replaces wholesale."""
    out = dict(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def build_effective_config(
    params: dict | None, base_path: str | Path = "config/config.yaml"
) -> Config:
    """The config a backtest should actually run with: the user's saved knobs
    (risk/strategy) deep-merged over the base config.yaml.

    The base supplies everything the UI doesn't expose — session times
    (`market`), data paths (`data`), broker settings — while the user's params
    override the knobs they set. Empty/None params yield the base config.
    """
    base = yaml.safe_load(Path(base_path).read_text())
    merged = _deep_merge(base, params or {})
    return Config.model_validate(merged)
