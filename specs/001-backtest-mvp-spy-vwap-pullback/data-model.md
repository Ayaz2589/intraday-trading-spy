# Phase 1 Data Model: Backtest MVP — SPY VWAP Pullback

All models live in `backend/src/intraday_trade_spy/models.py` (except
`RiskState`, which lives in `risk/state.py` because it carries mutable
session-scoped state). All models use Pydantic v2; immutable models
use `model_config = ConfigDict(frozen=True)`.

---

## `Direction` (enum)

```python
class Direction(str, Enum):
    LONG = "long"
```

Only one variant in v1 (constitution principle II). `SHORT` is
deliberately absent; adding it requires a constitution amendment.

---

## `SignalStatus` (enum)

```python
class SignalStatus(str, Enum):
    EMITTED = "emitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTED = "executed"
    EXITED = "exited"
    FORCE_FLAT = "force_flat"
    LOCKOUT = "lockout"
```

These are the only valid `JournalEntry.status` values. The ordering is
also used by the deterministic journal sort (Decision 6 in
`research.md`).

---

## `Bar` (frozen)

```python
class Bar(BaseModel):
    model_config = ConfigDict(frozen=True)
    symbol: Literal["SPY"]
    timestamp: AwareDatetime          # tz=America/New_York
    open: float
    high: float
    low: float
    close: float
    volume: int
    session_date: date                # ET calendar date

    @field_validator("high")
    @classmethod
    def _high_gte_low(cls, v, info):
        assert v >= info.data["low"], "high < low"
        return v
```

- `symbol` is `Literal["SPY"]` — enforces constitution I at the type
  level.
- `timestamp` is timezone-aware (ET).
- `session_date` is derived by the loader from `timestamp.date()` —
  storing it on the Bar avoids recomputation in indicators / journal.

---

## `IndicatorSnapshot` (frozen)

```python
class IndicatorSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)
    timestamp: AwareDatetime
    vwap: float                       # session VWAP at this bar
    or_high: float | None             # None until first in-OR bar
    or_low: float | None              # None until first in-OR bar
    or_complete: bool                 # True iff timestamp >= session_open + OR_minutes
    distance_from_vwap_pct: float     # (close - vwap) / vwap * 100
    prior_bar_close: float | None     # None for the first bar of the session
```

Carried alongside each `Bar` to the strategy. The strategy never reads
any other indicator state.

---

## `Signal` (frozen)

```python
class Signal(BaseModel):
    model_config = ConfigDict(frozen=True)
    symbol: Literal["SPY"]
    setup: Literal["vwap_pullback_long"]  # only one setup in v1
    direction: Direction                  # LONG only
    timestamp: AwareDatetime
    planned_entry: float
    stop_loss: float
    take_profit: float
    reason: str                           # human-readable "why" string

    @model_validator(mode="after")
    def _long_geometry(self):
        assert self.stop_loss < self.planned_entry, "stop must be below entry for a long"
        assert self.take_profit > self.planned_entry, "target must be above entry for a long"
        return self
```

Emitted by `strategy/vwap_pullback.py`. The geometry validators are
defense-in-depth — the risk manager will also reject bad geometry, but
catching it at construction time helps tests fail loudly.

---

## `RiskDecision` (frozen)

```python
class RiskDecision(BaseModel):
    model_config = ConfigDict(frozen=True)
    approved: bool
    reason: str                       # e.g., "approved", "daily_loss_limit_reached"
    quantity: int = 0
    planned_risk_dollars: float = 0.0
```

If `approved=False`, the broker MUST NOT enter a position. Tests
enforce this via the architecture test
(`test_module_boundaries.py`).

---

## `TradePlan` (frozen)

```python
class TradePlan(BaseModel):
    model_config = ConfigDict(frozen=True)
    signal: Signal
    quantity: int
    planned_risk_dollars: float
```

Created by the risk manager when `RiskDecision.approved=True`. The
broker accepts only `TradePlan`s (not raw `Signal`s) for entry.

---

## `Position` (mutable)

```python
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
```

Held by the backtest engine. The `same_bar_tiebreak` field records
Decision 5 from `research.md` when applicable.

---

## `JournalEntry` (frozen)

```python
class JournalEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    row_seq: int                      # in-engine insertion order (tie-break for deterministic sort)
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
    reason: str                       # always present; explains the row
    rejection_check: str | None = None  # only on REJECTED rows: the specific FR-007 check that failed
    same_bar_tiebreak: Literal["none", "stop_first"] | None = None
```

This is intentionally wide: every row carries the indicator snapshot at
decision time (spec FR-012 + User Story 2). Null-valued columns serialize
to empty cells in CSV (per the schema in
`contracts/journal-csv-schema.md`).

---

## `BacktestRun` (frozen)

```python
class BacktestRun(BaseModel):
    model_config = ConfigDict(frozen=True)
    run_id: str                       # ISO date + short hash
    run_started_at: AwareDatetime     # UTC
    run_ended_at: AwareDatetime       # UTC
    code_version: str                 # git SHA or "unversioned"
    config_snapshot: dict             # resolved config tree
    data_fingerprint: DataFingerprint
    summary: SummaryMetrics
```

Used by `manifest.py` to write `run.yaml`.

---

## `DataFingerprint` (frozen)

```python
class DataFingerprint(BaseModel):
    model_config = ConfigDict(frozen=True)
    sha256: str                       # 64 hex chars
    bar_count: int
    earliest_timestamp: AwareDatetime # ET
    latest_timestamp: AwareDatetime   # ET
    session_count: int
```

---

## `SummaryMetrics` (frozen)

```python
class SummaryMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)
    total_trades: int
    wins: int
    losses: int
    win_rate: float                   # 0.0 - 1.0
    average_win_r: float
    average_loss_r: float
    average_r: float
    total_r: float
    profit_factor: float | None       # None if no losses
    max_drawdown_r: float
    best_trade_r: float | None        # None if no trades
    worst_trade_r: float | None
    longest_consecutive_loss_streak: int
    rejected_signal_count: int
    rejection_breakdown: dict[str, int]
```

---

## `RiskState` (mutable — `risk/state.py`)

```python
@dataclass
class RiskState:
    session_date: date
    account_value: float
    trades_taken_today: int = 0
    consecutive_losses: int = 0
    cooldown_until: AwareDatetime | None = None
    daily_realized_pnl: float = 0.0
    open_position: Position | None = None
    daily_lockout_active: bool = False
```

Reset at the first bar of each new session. The risk manager reads and
mutates this object.

---

## Validation Rules Map (FR → model)

| FR | Where enforced |
|----|----------------|
| FR-002 (SPY only) | `Bar.symbol`, `Signal.symbol` Literal["SPY"] |
| FR-005 (OR complete) | `IndicatorSnapshot.or_complete` |
| FR-006 (VWAP pullback rules) | `strategy/vwap_pullback.py` reading `IndicatorSnapshot` |
| FR-007 (risk checks) | `RiskManager.validate()` |
| FR-008 (sizing) | `risk/sizing.py::position_size()` |
| FR-009 (entry fill on next open) | `broker/paper.py::simulate_entry()` |
| FR-009 (same-bar tiebreak) | `Position.same_bar_tiebreak` + broker logic |
| FR-010 (bracket exclusivity) | `broker/paper.py::simulate_bar()` |
| FR-011 (force-flat) | `clock.py::is_force_flat()` + broker call |
| FR-012 (journal every event) | `journal/logger.py` — single sink |
| FR-013 (no future leak) | `data/bars.py::BarIterator` — structural |
| FR-014 (run manifest) | `backtest/manifest.py` + `BacktestRun` model |
| FR-015 (byte-identical) | `journal/exporter.py` + deterministic sort key |
| FR-016 (summary fields) | `backtest/metrics.py` + `SummaryMetrics` |
| FR-017 (live disabled) | `config.py` — `Literal[False]` on `broker.live_auto_enabled` |
