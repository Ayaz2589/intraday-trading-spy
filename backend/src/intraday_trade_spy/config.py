from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field


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


class DataConfig(BaseModel):
    timeframe: Literal["5m"] = "5m"
    csv_path: str
    output_dir: str
    require_regular_session_only: bool = True


class OpeningRangeConfig(BaseModel):
    minutes: int = 15


class VwapPullbackStopConfig(BaseModel):
    type: Literal["below_pullback_low"] = "below_pullback_low"
    buffer_pct: float = 0.05


class VwapPullbackTargetConfig(BaseModel):
    risk_reward: float = 2.0


class VwapPullbackConfirmationConfig(BaseModel):
    require_close_above_prior_bar_high: bool = True
    require_close_above_vwap: bool = True


class VwapPullbackConfig(BaseModel):
    min_minutes_after_open: int = 15
    max_distance_from_vwap_pct: float = 0.25
    confirmation: VwapPullbackConfirmationConfig = Field(default_factory=VwapPullbackConfirmationConfig)
    stop: VwapPullbackStopConfig = Field(default_factory=VwapPullbackStopConfig)
    target: VwapPullbackTargetConfig = Field(default_factory=VwapPullbackTargetConfig)


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
    fees_per_share: float = 0.0
    slippage_per_share: float = 0.0


class Config(BaseModel):
    app: AppConfig = Field(default_factory=AppConfig)
    market: MarketConfig
    data: DataConfig
    strategy: StrategyConfig = Field(default_factory=StrategyConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    broker: BrokerConfig = Field(default_factory=BrokerConfig)


def load_config(path: str | Path) -> Config:
    raw = yaml.safe_load(Path(path).read_text())
    return Config.model_validate(raw)
