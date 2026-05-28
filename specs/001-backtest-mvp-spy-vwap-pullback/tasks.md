---
description: "Task list for Backtest MVP — SPY VWAP Pullback (Feature 001)"
---

# Tasks: Backtest MVP — SPY VWAP Pullback

**Input**: Design documents from `/specs/001-backtest-mvp-spy-vwap-pullback/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/*`, `quickstart.md`. Constitution v1.0.0 at
`.specify/memory/constitution.md`.

**Tests**: Tests are OPTIONAL in general, BUT per constitution
principle IV (Test-First for Strategy & Risk, NON-NEGOTIABLE), tests
are MANDATORY for every task touching
`backend/src/intraday_trade_spy/strategy/`,
`backend/src/intraday_trade_spy/risk/`,
`backend/src/intraday_trade_spy/broker/`,
`backend/src/intraday_trade_spy/backtest/`,
`backend/src/intraday_trade_spy/journal/`, and
`backend/src/intraday_trade_spy/data/indicators.py`. For those tasks,
the failing test MUST be authored before implementation and is listed
as a preceding task.

**Organization**: Tasks are grouped by phase. Within Phases 3–7, tasks
are also tagged with the user story they serve (`[US1]` … `[US5]`).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task
  dependencies)
- **[Story]**: Required in Phases 3–7; maps to spec.md user stories
- Every task lists exact file paths
- Every task is small enough to complete in 2–10 minutes

## TDD micro-cycle convention

Each implementation task whose target lives under
`strategy/`, `risk/`, `broker/`, `backtest/`, `journal/`, or
`data/indicators.py` is preceded by a `Test:` task containing the
failing test. The pattern inside each task is:

1. Write the failing test
2. Run `pytest <node>` and verify it fails
3. Write minimal implementation
4. Run `pytest <node>` and verify it passes
5. Commit

For tasks outside the TDD-mandatory paths, tests are optional and only
included where they catch a real risk (e.g., the config validation
tests in Phase 2).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the monorepo skeleton, the backend Python project,
the fixture file, and the shared pytest configuration. Nothing here
depends on anything else in the feature.

- [X] T001 Create the top-level monorepo skeleton — `backend/`, `frontend/`, `docs/`, `backend/{config,data,scripts,src,tests}`, `backend/data/{raw,backtests}`, `backend/src/intraday_trade_spy/{data,strategy,risk,broker,journal,backtest,cli}`, `backend/tests/fixtures`. Add `.gitkeep` in `backend/data/backtests/`. Use `mkdir -p` and verify with `ls -R backend frontend docs | head -50`.

- [X] T002 [P] Create the root `.gitignore` at `/Users/ayazuddin/Development/personal/Trading/intraday-trading-SPY/.gitignore` with at minimum:
  ```
  __pycache__/
  *.pyc
  *.pyo
  .venv/
  .pytest_cache/
  .ruff_cache/
  .coverage
  htmlcov/
  backend/data/backtests/*
  !backend/data/backtests/.gitkeep
  ```

- [X] T003 [P] Create `/Users/ayazuddin/Development/personal/Trading/intraday-trading-SPY/.python-version` containing the single line `3.11`.

- [X] T004 [P] Create the frontend placeholder at `frontend/README.md` containing only the text `Implemented by Feature 003 (Static React Learning UI).`

- [X] T005 [P] Create the docs placeholder at `docs/README.md` containing only the text `Product, strategy, risk, frontend, backtesting, and paper-trading docs will be added by later features.`

- [X] T006 [P] Create the root README stub at `README.md`. Use this exact content:
  ```markdown
  # intraday-trade-spy

  A standalone SPY-only intraday trading research, paper-trading, and
  learning app. v1 covers backtesting only — see
  `specs/001-backtest-mvp-spy-vwap-pullback/` for the active feature.

  ## Quickstart

  See `specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md`.

  ## Constitution

  See `.specify/memory/constitution.md`.
  ```

- [X] T007 Create `backend/pyproject.toml` with the project metadata and dependencies. Surface area:
  ```toml
  [project]
  name = "intraday-trade-spy"
  version = "0.1.0"
  description = "SPY-only intraday backtester + (later) paper trader"
  requires-python = ">=3.11"
  dependencies = [
      "pydantic>=2.6",
      "pyyaml>=6.0",
      "pandas>=2.2",
      "python-dateutil>=2.9",
  ]

  [project.optional-dependencies]
  dev = [
      "pytest>=8.0",
      "pytest-cov>=5.0",
      "freezegun>=1.5",
      "ruff>=0.5",
  ]

  [project.scripts]
  intraday-trade-spy-backtest = "intraday_trade_spy.cli.run_backtest:main"

  [build-system]
  requires = ["setuptools>=68"]
  build-backend = "setuptools.build_meta"

  [tool.setuptools.packages.find]
  where = ["src"]

  [tool.ruff]
  line-length = 100
  target-version = "py311"
  src = ["src", "tests"]

  [tool.ruff.lint]
  select = ["E", "F", "I", "B", "UP"]

  [tool.pytest.ini_options]
  addopts = "-ra --strict-markers"
  testpaths = ["tests"]
  ```

- [X] T008 [P] Create the backend README at `backend/README.md`. Use this content:
  ```markdown
  # backend — intraday-trade-spy

  See `../specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md` for
  setup + run instructions.
  ```

- [X] T009 [P] Create the bundled fixture at `backend/data/raw/spy_5m_sample.csv`. Author a small synthetic SPY 5-minute dataset covering three regular sessions (2026-05-26, 2026-05-27, 2026-05-28). Column order: `symbol,timestamp,open,high,low,close,volume`. Timestamps in ISO 8601 with `-04:00` offset, every 5 minutes from 09:30 to 16:00 ET inclusive of 09:30, exclusive of 16:00 (78 bars per session × 3 = 234 rows). Make at least one session produce a viable VWAP pullback (price above VWAP after OR, dips to within 0.25% of VWAP, then a confirmation candle closes above the prior bar's high and above VWAP). Make at least one session trigger a daily-loss-limit rejection by including a setup that risks and loses twice. Save the same file (or a symlink) at `backend/tests/fixtures/spy_5m_sample.csv`.

- [X] T010 Create `backend/config/config.yaml` with the exact default tree from `contracts/run-yaml-schema.md`'s `resolved_config` section. Pay special attention to `market.symbol: SPY`, `app.mode: backtest`, `broker.live_auto_enabled: false`, `data.csv_path: data/raw/spy_5m_sample.csv`, and `data.output_dir: data/backtests`.

- [X] T011 [P] Create `backend/config/logging.yaml` as a minimal Python `logging.dictConfig`-compatible YAML. Surface area:
  ```yaml
  version: 1
  disable_existing_loggers: false
  formatters:
    plain:
      format: "%(asctime)s %(levelname)s %(name)s: %(message)s"
  handlers:
    console:
      class: logging.StreamHandler
      formatter: plain
      level: INFO
  root:
    level: INFO
    handlers: [console]
  ```

- [X] T012 [P] Create `backend/tests/conftest.py` with shared fixtures. Surface area:
  ```python
  from pathlib import Path
  import pytest

  FIXTURES = Path(__file__).parent / "fixtures"

  @pytest.fixture
  def sample_csv_path() -> Path:
      return FIXTURES / "spy_5m_sample.csv"

  @pytest.fixture
  def adversarial_future_leak_csv_path() -> Path:
      return FIXTURES / "adversarial_future_leak.csv"

  @pytest.fixture
  def default_config_path() -> Path:
      return Path(__file__).parent.parent / "config" / "config.yaml"
  ```

- [X] T013 [P] Create empty `__init__.py` files under every package directory: `backend/src/intraday_trade_spy/__init__.py`, `backend/src/intraday_trade_spy/data/__init__.py`, `backend/src/intraday_trade_spy/strategy/__init__.py`, `backend/src/intraday_trade_spy/risk/__init__.py`, `backend/src/intraday_trade_spy/broker/__init__.py`, `backend/src/intraday_trade_spy/journal/__init__.py`, `backend/src/intraday_trade_spy/backtest/__init__.py`, `backend/src/intraday_trade_spy/cli/__init__.py`. Each file is empty.

- [X] T014 Install the package in editable mode. Run:
  ```bash
  cd backend && python -m venv .venv && source .venv/bin/activate && pip install --upgrade pip && pip install -e ".[dev]"
  ```
  Verify: `python -c "import intraday_trade_spy" && echo ok` prints `ok`. Verify: `pytest --collect-only` reports zero tests collected (no failures).

**Checkpoint (Phase 1)**: `ls backend/{config,data,scripts,src,tests}` is non-empty; `python -m pytest --collect-only` exits 0 with zero tests; `ruff check backend/src` exits 0; `cat backend/data/raw/spy_5m_sample.csv | wc -l` reports 235 (234 data rows + 1 header).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build every shared module that downstream user-story phases
depend on — config, models, clock, journal sink, data loader,
BarIterator, fingerprint, indicators. **No user story work may begin
until this phase is complete.**

### Config (FR-001, FR-002, FR-017)

- [X] T015 Test: in `backend/tests/test_config.py`, add:
  ```python
  from intraday_trade_spy.config import load_config

  def test_loads_default_config(default_config_path):
      cfg = load_config(default_config_path)
      assert cfg.market.symbol == "SPY"
      assert cfg.app.mode == "backtest"
      assert cfg.broker.live_auto_enabled is False
  ```
  Run `pytest backend/tests/test_config.py::test_loads_default_config -v` — expect failure (`ModuleNotFoundError: intraday_trade_spy.config` or `AttributeError`).

- [X] T016 Implement `backend/src/intraday_trade_spy/config.py`. Surface area:
  ```python
  from typing import Literal
  from pathlib import Path
  import yaml
  from pydantic import BaseModel, Field

  class AppConfig(BaseModel):
      name: str = "intraday-trade-spy"
      timezone: Literal["America/New_York"] = "America/New_York"
      mode: Literal["backtest"] = "backtest"  # later features will widen

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
  ```
  Run `pytest backend/tests/test_config.py::test_loads_default_config -v` — expect PASS. Commit.

- [X] T017 Test: add `test_rejects_non_spy_symbol` and `test_rejects_live_auto_enabled` in `backend/tests/test_config.py`:
  ```python
  import pytest
  from pydantic import ValidationError
  from intraday_trade_spy.config import Config

  def test_rejects_non_spy_symbol():
      bad = {"market": {"symbol": "QQQ", "session_start": "09:30:00", "session_end": "16:00:00", "no_new_trades_after": "15:30:00", "force_flat_time": "15:55:00"}, "data": {"csv_path": "x", "output_dir": "y"}}
      with pytest.raises(ValidationError) as exc:
          Config.model_validate(bad)
      assert "SPY" in str(exc.value)

  def test_rejects_live_auto_enabled():
      bad = {"market": {"symbol": "SPY", "session_start": "09:30:00", "session_end": "16:00:00", "no_new_trades_after": "15:30:00", "force_flat_time": "15:55:00"}, "data": {"csv_path": "x", "output_dir": "y"}, "broker": {"provider": "paper", "live_auto_enabled": True}}
      with pytest.raises(ValidationError):
          Config.model_validate(bad)
  ```
  Run — both should already PASS (the `Literal` types in T016 enforce this). If not, fix the schema. Commit.

### Models (FR-002, FR-006, FR-007, FR-009)

- [X] T018 [P] Test: in `backend/tests/test_models.py`, add:
  ```python
  import pytest
  from datetime import datetime, date
  from zoneinfo import ZoneInfo
  from pydantic import ValidationError
  from intraday_trade_spy.models import Bar, Direction, Signal

  ET = ZoneInfo("America/New_York")

  def test_bar_rejects_non_spy():
      with pytest.raises(ValidationError):
          Bar(symbol="QQQ", timestamp=datetime(2026,5,28,10,0,tzinfo=ET), open=1, high=1, low=1, close=1, volume=1, session_date=date(2026,5,28))

  def test_bar_rejects_high_below_low():
      with pytest.raises(AssertionError):
          Bar(symbol="SPY", timestamp=datetime(2026,5,28,10,0,tzinfo=ET), open=1, high=0.5, low=1.0, close=1, volume=1, session_date=date(2026,5,28))

  def test_direction_only_long():
      assert [d.value for d in Direction] == ["long"]

  def test_signal_rejects_stop_above_entry():
      with pytest.raises(AssertionError):
          Signal(symbol="SPY", setup="vwap_pullback_long", direction=Direction.LONG, timestamp=datetime(2026,5,28,10,0,tzinfo=ET), planned_entry=100.0, stop_loss=101.0, take_profit=102.0, reason="x")
  ```
  Run — expect failure (models don't exist yet).

- [X] T019 Implement `backend/src/intraday_trade_spy/models.py` with every entity from `data-model.md`: `Direction`, `SignalStatus`, `Bar`, `IndicatorSnapshot`, `Signal`, `RiskDecision`, `TradePlan`, `Position`, `JournalEntry`, `BacktestRun`, `DataFingerprint`, `SummaryMetrics`. Use the exact field definitions from `data-model.md`. All immutable models use `model_config = ConfigDict(frozen=True)`. The `Bar` validator for `high >= low` and the `Signal` `model_validator(mode="after")` for `stop < entry < target` come from `data-model.md`. Run T018 tests — expect PASS. Commit.

### Clock (Engineering Standards — single source of truth)

- [X] T020 Test: in `backend/tests/test_clock.py`:
  ```python
  from datetime import datetime, time
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.clock import MarketClock

  ET = ZoneInfo("America/New_York")

  def test_market_open_inside_session():
      clk = MarketClock(session_start=time(9,30), session_end=time(16,0),
                        no_new_trades_after=time(15,30), force_flat_time=time(15,55))
      assert clk.is_market_open(datetime(2026,5,28,10,0,tzinfo=ET)) is True

  def test_or_complete_after_window():
      clk = MarketClock(session_start=time(9,30), session_end=time(16,0),
                        no_new_trades_after=time(15,30), force_flat_time=time(15,55))
      assert clk.is_or_complete(datetime(2026,5,28,9,45,tzinfo=ET), or_minutes=15) is True
      assert clk.is_or_complete(datetime(2026,5,28,9,40,tzinfo=ET), or_minutes=15) is False

  def test_no_new_trades_after_cutoff():
      clk = MarketClock(session_start=time(9,30), session_end=time(16,0),
                        no_new_trades_after=time(15,30), force_flat_time=time(15,55))
      assert clk.allow_new_trades(datetime(2026,5,28,15,29,tzinfo=ET)) is True
      assert clk.allow_new_trades(datetime(2026,5,28,15,31,tzinfo=ET)) is False

  def test_force_flat():
      clk = MarketClock(session_start=time(9,30), session_end=time(16,0),
                        no_new_trades_after=time(15,30), force_flat_time=time(15,55))
      assert clk.is_force_flat(datetime(2026,5,28,15,55,tzinfo=ET)) is True
  ```
  Run — expect failure.

- [X] T021 Implement `backend/src/intraday_trade_spy/clock.py`. Surface area:
  ```python
  from dataclasses import dataclass
  from datetime import datetime, time, timedelta
  from zoneinfo import ZoneInfo

  ET = ZoneInfo("America/New_York")

  @dataclass(frozen=True)
  class MarketClock:
      session_start: time
      session_end: time
      no_new_trades_after: time
      force_flat_time: time

      def _et(self, dt: datetime) -> datetime:
          return dt if dt.tzinfo == ET else dt.astimezone(ET)

      def is_market_open(self, dt: datetime) -> bool:
          t = self._et(dt).time()
          return self.session_start <= t < self.session_end

      def is_or_complete(self, dt: datetime, or_minutes: int) -> bool:
          t = self._et(dt).time()
          cutoff = (datetime.combine(datetime.today(), self.session_start) + timedelta(minutes=or_minutes)).time()
          return t >= cutoff

      def allow_new_trades(self, dt: datetime) -> bool:
          t = self._et(dt).time()
          return self.session_start <= t < self.no_new_trades_after

      def is_force_flat(self, dt: datetime) -> bool:
          t = self._et(dt).time()
          return t >= self.force_flat_time
  ```
  Run T020 — expect PASS. Commit.

### Journal sink (FR-012)

- [X] T022 Test: in `backend/tests/test_journal.py`:
  ```python
  from datetime import datetime
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.journal.logger import JournalLogger
  from intraday_trade_spy.models import SignalStatus

  ET = ZoneInfo("America/New_York")

  def test_logger_records_emitted_row():
      log = JournalLogger()
      log.log(status=SignalStatus.EMITTED, timestamp=datetime(2026,5,28,10,15,tzinfo=ET),
              setup="vwap_pullback_long", reason="r")
      rows = log.rows()
      assert len(rows) == 1
      assert rows[0].status == SignalStatus.EMITTED
      assert rows[0].row_seq == 0
  ```
  Run — expect failure.

- [X] T023 Implement `backend/src/intraday_trade_spy/journal/logger.py`. Surface area:
  ```python
  from typing import Any
  from intraday_trade_spy.models import JournalEntry

  class JournalLogger:
      def __init__(self) -> None:
          self._rows: list[JournalEntry] = []

      def log(self, **fields: Any) -> JournalEntry:
          entry = JournalEntry(row_seq=len(self._rows), **fields)
          self._rows.append(entry)
          return entry

      def rows(self) -> list[JournalEntry]:
          return list(self._rows)
  ```
  Run T022 — expect PASS. Commit.

- [X] T024 Test: in `backend/tests/test_journal.py`, add `test_exporter_writes_deterministic_csv`:
  ```python
  from pathlib import Path
  from datetime import datetime
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.journal.logger import JournalLogger
  from intraday_trade_spy.journal.exporter import write_journal_csv
  from intraday_trade_spy.models import SignalStatus

  ET = ZoneInfo("America/New_York")

  def test_exporter_writes_deterministic_csv(tmp_path: Path):
      log = JournalLogger()
      log.log(status=SignalStatus.EMITTED, timestamp=datetime(2026,5,28,10,15,tzinfo=ET), setup="vwap_pullback_long", reason="r1")
      log.log(status=SignalStatus.APPROVED, timestamp=datetime(2026,5,28,10,15,tzinfo=ET), setup="vwap_pullback_long", reason="r2")
      path = tmp_path / "journal.csv"
      write_journal_csv(log.rows(), path)
      content = path.read_bytes()
      assert content.startswith(b"row_seq,timestamp,status,")
      assert b"\r\n" not in content
      # Same input → same output bytes
      path2 = tmp_path / "journal2.csv"
      write_journal_csv(log.rows(), path2)
      assert path.read_bytes() == path2.read_bytes()
  ```
  Run — expect failure.

- [X] T025 Implement `backend/src/intraday_trade_spy/journal/exporter.py`. Surface area:
  ```python
  import csv
  from pathlib import Path
  from intraday_trade_spy.models import JournalEntry, SignalStatus

  COLUMNS = [
      "row_seq","timestamp","status","setup","direction","planned_entry",
      "stop_loss","take_profit","quantity","planned_risk_dollars",
      "actual_entry","actual_exit","exit_reason","realized_pnl","realized_r",
      "vwap","or_high","or_low","distance_from_vwap_pct","prior_bar_close",
      "reason","rejection_check","same_bar_tiebreak",
  ]

  STATUS_PRIORITY = {
      SignalStatus.EMITTED: 0, SignalStatus.APPROVED: 1, SignalStatus.REJECTED: 1,
      SignalStatus.EXECUTED: 2, SignalStatus.EXITED: 3, SignalStatus.FORCE_FLAT: 3,
      SignalStatus.LOCKOUT: 4,
  }

  _FLOAT_FMT = {
      "planned_entry": "{:.4f}", "stop_loss": "{:.4f}", "take_profit": "{:.4f}",
      "planned_risk_dollars": "{:.2f}", "actual_entry": "{:.4f}", "actual_exit": "{:.4f}",
      "realized_pnl": "{:.2f}", "realized_r": "{:.3f}", "vwap": "{:.4f}",
      "or_high": "{:.4f}", "or_low": "{:.4f}", "distance_from_vwap_pct": "{:.4f}",
      "prior_bar_close": "{:.4f}",
  }

  def _serialize(entry: JournalEntry, col: str) -> str:
      v = getattr(entry, col, None)
      if v is None:
          return ""
      if col == "timestamp":
          return v.isoformat()
      if col == "status" or col == "direction" or col == "exit_reason" or col == "same_bar_tiebreak":
          return v.value if hasattr(v, "value") else str(v)
      if col in _FLOAT_FMT:
          return _FLOAT_FMT[col].format(v)
      return str(v)

  def write_journal_csv(entries: list[JournalEntry], path: Path) -> None:
      sorted_entries = sorted(
          entries,
          key=lambda e: (e.timestamp.isoformat(), STATUS_PRIORITY[e.status], e.row_seq),
      )
      with open(path, "w", encoding="utf-8", newline="") as f:
          writer = csv.writer(f, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
          writer.writerow(COLUMNS)
          for entry in sorted_entries:
              writer.writerow([_serialize(entry, c) for c in COLUMNS])
  ```
  Run T024 — expect PASS. Commit.

### Data loader (FR-003)

- [X] T026 Test: in `backend/tests/test_loader.py`:
  ```python
  from intraday_trade_spy.data.loader import load_bars
  from intraday_trade_spy.config import MarketConfig

  def test_load_normalizes_to_et_and_filters_session(sample_csv_path):
      market = MarketConfig(symbol="SPY", session_start="09:30:00", session_end="16:00:00", no_new_trades_after="15:30:00", force_flat_time="15:55:00")
      df = load_bars(sample_csv_path, market=market)
      assert len(df) == 234
      assert str(df["timestamp"].dt.tz) == "America/New_York"
      assert df["symbol"].unique().tolist() == ["SPY"]

  def test_load_rejects_non_spy(tmp_path):
      bad = tmp_path / "qqq.csv"
      bad.write_text("symbol,timestamp,open,high,low,close,volume\nQQQ,2026-05-28T09:30:00-04:00,1,1,1,1,1\n")
      market = MarketConfig(symbol="SPY", session_start="09:30:00", session_end="16:00:00", no_new_trades_after="15:30:00", force_flat_time="15:55:00")
      import pytest
      with pytest.raises(ValueError, match="SPY"):
          load_bars(bad, market=market)
  ```
  Run — expect failure.

- [X] T027 Implement `backend/src/intraday_trade_spy/data/loader.py`. Surface area:
  ```python
  from pathlib import Path
  import pandas as pd
  from intraday_trade_spy.config import MarketConfig

  ET = "America/New_York"

  def load_bars(path: str | Path, *, market: MarketConfig) -> pd.DataFrame:
      df = pd.read_csv(path)
      bad = sorted(set(df["symbol"]) - {"SPY"})
      if bad:
          raise ValueError(f"Non-SPY symbols present: {bad} (constitution principle I)")
      df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(ET)
      session_start = pd.to_datetime(market.session_start).time()
      session_end = pd.to_datetime(market.session_end).time()
      mask = (df["timestamp"].dt.time >= session_start) & (df["timestamp"].dt.time < session_end)
      df = df.loc[mask].copy()
      df["session_date"] = df["timestamp"].dt.date
      df = df.sort_values("timestamp", kind="mergesort").reset_index(drop=True)
      return df
  ```
  Run T026 — expect PASS. Commit.

### BarIterator (FR-013 — structural future-leak prevention)

- [X] T028 Test: in `backend/tests/test_loader.py`, add:
  ```python
  from intraday_trade_spy.data.bars import BarIterator

  def test_bar_iterator_yields_typed_bars(sample_csv_path):
      from intraday_trade_spy.config import MarketConfig
      from intraday_trade_spy.data.loader import load_bars
      market = MarketConfig(symbol="SPY", session_start="09:30:00", session_end="16:00:00", no_new_trades_after="15:30:00", force_flat_time="15:55:00")
      df = load_bars(sample_csv_path, market=market)
      bars = list(BarIterator(df))
      assert len(bars) == 234
      assert all(b.symbol == "SPY" for b in bars)
      assert all(bars[i].timestamp < bars[i+1].timestamp for i in range(len(bars)-1))
  ```
  Run — expect failure.

- [X] T029 Implement `backend/src/intraday_trade_spy/data/bars.py`. Surface area:
  ```python
  from typing import Iterator
  import pandas as pd
  from intraday_trade_spy.models import Bar

  class BarIterator:
      def __init__(self, df: pd.DataFrame) -> None:
          self._df = df

      def __iter__(self) -> Iterator[Bar]:
          for row in self._df.itertuples(index=False):
              yield Bar(
                  symbol=row.symbol, timestamp=row.timestamp,
                  open=float(row.open), high=float(row.high), low=float(row.low),
                  close=float(row.close), volume=int(row.volume),
                  session_date=row.session_date,
              )
  ```
  Run T028 — expect PASS. Commit.

### Data fingerprint (FR-014)

- [X] T030 [P] Test: in `backend/tests/test_loader.py`, add:
  ```python
  from intraday_trade_spy.data.fingerprint import fingerprint_csv

  def test_fingerprint_stable(sample_csv_path):
      fp1 = fingerprint_csv(sample_csv_path)
      fp2 = fingerprint_csv(sample_csv_path)
      assert fp1 == fp2
      assert len(fp1.sha256) == 64
  ```
  Run — expect failure.

- [X] T031 Implement `backend/src/intraday_trade_spy/data/fingerprint.py`. Surface area:
  ```python
  import hashlib
  from pathlib import Path
  import pandas as pd
  from intraday_trade_spy.models import DataFingerprint

  def fingerprint_csv(path: str | Path) -> DataFingerprint:
      raw = Path(path).read_bytes()
      sha = hashlib.sha256(raw).hexdigest()
      df = pd.read_csv(path)
      df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert("America/New_York")
      sessions = df["timestamp"].dt.date.nunique()
      return DataFingerprint(
          sha256=sha,
          bar_count=len(df),
          earliest_timestamp=df["timestamp"].min(),
          latest_timestamp=df["timestamp"].max(),
          session_count=int(sessions),
      )
  ```
  Run T030 — expect PASS. Commit.

### Indicators (FR-004, FR-005)

- [X] T032 Test: in `backend/tests/test_indicators.py`:
  ```python
  import pandas as pd
  from intraday_trade_spy.data.indicators import attach_indicators

  def test_vwap_resets_each_session(sample_csv_path):
      from intraday_trade_spy.config import MarketConfig
      from intraday_trade_spy.data.loader import load_bars
      market = MarketConfig(symbol="SPY", session_start="09:30:00", session_end="16:00:00", no_new_trades_after="15:30:00", force_flat_time="15:55:00")
      df = load_bars(sample_csv_path, market=market)
      df = attach_indicators(df, or_minutes=15)
      first_per_session = df.groupby("session_date").head(1)
      typical_at_open = (first_per_session["high"] + first_per_session["low"] + first_per_session["close"]) / 3
      pd.testing.assert_series_equal(first_per_session["vwap"].reset_index(drop=True), typical_at_open.reset_index(drop=True), check_names=False)
  ```
  Plus an OR-completion test:
  ```python
  def test_or_complete_flag(sample_csv_path):
      from intraday_trade_spy.config import MarketConfig
      from intraday_trade_spy.data.loader import load_bars
      market = MarketConfig(symbol="SPY", session_start="09:30:00", session_end="16:00:00", no_new_trades_after="15:30:00", force_flat_time="15:55:00")
      df = load_bars(sample_csv_path, market=market)
      df = attach_indicators(df, or_minutes=15)
      bar_at_945 = df[df["timestamp"].dt.time == pd.Timestamp("09:45").time()].iloc[0]
      bar_at_940 = df[df["timestamp"].dt.time == pd.Timestamp("09:40").time()].iloc[0]
      assert bar_at_945["or_complete"] is True or bar_at_945["or_complete"] == True  # noqa: E712
      assert bar_at_940["or_complete"] is False or bar_at_940["or_complete"] == False  # noqa: E712
  ```
  Run — expect failure.

- [X] T033 Implement `backend/src/intraday_trade_spy/data/indicators.py`. Surface area:
  ```python
  from datetime import timedelta
  import pandas as pd
  from intraday_trade_spy.models import IndicatorSnapshot

  def attach_indicators(df: pd.DataFrame, *, or_minutes: int) -> pd.DataFrame:
      df = df.copy()
      tp = (df["high"] + df["low"] + df["close"]) / 3
      df["_pv"] = tp * df["volume"]
      grouped = df.groupby("session_date", group_keys=False, sort=False)
      df["vwap"] = grouped.apply(lambda g: g["_pv"].cumsum() / g["volume"].cumsum().replace(0, pd.NA))
      df = df.drop(columns=["_pv"])
      def _or_high_low(g: pd.DataFrame) -> pd.DataFrame:
          session_open = g["timestamp"].iloc[0]
          cutoff = session_open + timedelta(minutes=or_minutes)
          in_or = g["timestamp"] < cutoff
          g = g.copy()
          g["or_high"] = g.loc[in_or, "high"].cummax().reindex(g.index).ffill()
          g["or_low"] = g.loc[in_or, "low"].cummin().reindex(g.index).ffill()
          g["or_complete"] = g["timestamp"] >= cutoff
          return g
      df = grouped.apply(_or_high_low)
      df["distance_from_vwap_pct"] = (df["close"] - df["vwap"]) / df["vwap"] * 100
      df["prior_bar_close"] = df.groupby("session_date")["close"].shift(1)
      return df.reset_index(drop=True)

  def snapshot_from_row(row: pd.Series) -> IndicatorSnapshot:
      return IndicatorSnapshot(
          timestamp=row["timestamp"],
          vwap=float(row["vwap"]),
          or_high=None if pd.isna(row["or_high"]) else float(row["or_high"]),
          or_low=None if pd.isna(row["or_low"]) else float(row["or_low"]),
          or_complete=bool(row["or_complete"]),
          distance_from_vwap_pct=float(row["distance_from_vwap_pct"]),
          prior_bar_close=None if pd.isna(row["prior_bar_close"]) else float(row["prior_bar_close"]),
      )
  ```
  Run T032 — expect PASS. Commit.

### Architecture guard

- [X] T034 Test: in `backend/tests/test_module_boundaries.py`:
  ```python
  import ast
  from pathlib import Path

  STRATEGY_DIR = Path("backend/src/intraday_trade_spy/strategy")
  FORBIDDEN_PREFIXES = ("intraday_trade_spy.broker", "intraday_trade_spy.risk")

  def _imports(file: Path) -> set[str]:
      tree = ast.parse(file.read_text())
      out = set()
      for node in ast.walk(tree):
          if isinstance(node, ast.ImportFrom) and node.module:
              out.add(node.module)
          elif isinstance(node, ast.Import):
              for n in node.names:
                  out.add(n.name)
      return out

  def test_strategy_does_not_import_broker_or_risk():
      for f in STRATEGY_DIR.rglob("*.py"):
          mods = _imports(f)
          for m in mods:
              assert not any(m.startswith(p) for p in FORBIDDEN_PREFIXES), f"{f} imports {m}"
  ```
  Run — expect PASS (no strategy code exists yet so set is empty; pre-empts later regressions).

**Checkpoint (Phase 2)**: Run `pytest backend/tests/test_config.py backend/tests/test_models.py backend/tests/test_clock.py backend/tests/test_journal.py backend/tests/test_loader.py backend/tests/test_indicators.py backend/tests/test_module_boundaries.py -v` — all green. Confirm `python -c "from intraday_trade_spy.data.bars import BarIterator; from intraday_trade_spy.data.indicators import attach_indicators; print('ok')"` prints `ok`.

---

## Phase 3: User Story 1 — Run a backtest and get a journal (Priority: P1) 🎯 MVP

**Goal**: A single CLI command runs the strategy → risk → broker →
journal pipeline against the bundled fixture and produces `journal.csv`,
`summary.json`, and `run.yaml`.

**Independent Test**: `python -m intraday_trade_spy.cli.run_backtest --config backend/config/config.yaml`
produces ≥1 emitted-signal row and ≥1 rejection row in `journal.csv`,
and prints a SUMMARY block to stdout.

### Strategy (FR-006)

- [ ] T035 [US1] Test: in `backend/tests/test_vwap_pullback.py`, add tests covering each rule of FR-006:
  ```python
  from datetime import datetime
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.models import Bar, IndicatorSnapshot
  from intraday_trade_spy.strategy.vwap_pullback import VwapPullbackLong
  from intraday_trade_spy.config import VwapPullbackConfig

  ET = ZoneInfo("America/New_York")

  def _bar(ts, o, h, l, c):
      from datetime import date
      return Bar(symbol="SPY", timestamp=ts, open=o, high=h, low=l, close=c, volume=1000, session_date=ts.date())

  def _snap(ts, vwap, or_h, or_l, or_complete, dist, prior):
      return IndicatorSnapshot(timestamp=ts, vwap=vwap, or_high=or_h, or_low=or_l, or_complete=or_complete, distance_from_vwap_pct=dist, prior_bar_close=prior)

  def test_no_signal_before_or_complete():
      cfg = VwapPullbackConfig()
      strat = VwapPullbackLong(cfg)
      ts = datetime(2026,5,28,9,40,tzinfo=ET)
      bar = _bar(ts, 525, 525.1, 524.9, 525.0)
      snap = _snap(ts, 524.9, None, None, False, 0.02, 524.8)
      assert strat.evaluate(bar, snap) is None

  def test_no_signal_below_vwap():
      cfg = VwapPullbackConfig()
      strat = VwapPullbackLong(cfg)
      ts = datetime(2026,5,28,10,15,tzinfo=ET)
      bar = _bar(ts, 524.5, 524.7, 524.2, 524.3)  # close below vwap
      snap = _snap(ts, 524.9, 525.0, 523.9, True, -0.114, 524.4)
      assert strat.evaluate(bar, snap) is None

  def test_emits_signal_on_clean_pullback_confirmation():
      cfg = VwapPullbackConfig(max_distance_from_vwap_pct=0.25)
      strat = VwapPullbackLong(cfg)
      ts = datetime(2026,5,28,10,15,tzinfo=ET)
      bar = _bar(ts, 525.0, 525.2, 524.85, 525.10)  # close above prior bar high AND above vwap
      snap = _snap(ts, 524.88, 525.0, 523.9, True, 0.042, 525.05)
      sig = strat.evaluate(bar, snap)
      assert sig is not None
      assert sig.planned_entry == 525.10
      assert sig.stop_loss < sig.planned_entry < sig.take_profit
  ```
  Run — expect failure.

- [ ] T036 [US1] Implement `backend/src/intraday_trade_spy/strategy/base.py`. Surface area:
  ```python
  from typing import Protocol
  from intraday_trade_spy.models import Bar, IndicatorSnapshot, Signal

  class Strategy(Protocol):
      def evaluate(self, bar: Bar, snapshot: IndicatorSnapshot) -> Signal | None: ...
  ```

- [ ] T037 [US1] Implement `backend/src/intraday_trade_spy/strategy/vwap_pullback.py`. Surface area:
  ```python
  from intraday_trade_spy.config import VwapPullbackConfig
  from intraday_trade_spy.models import Bar, Direction, IndicatorSnapshot, Signal

  class VwapPullbackLong:
      def __init__(self, cfg: VwapPullbackConfig) -> None:
          self.cfg = cfg

      def evaluate(self, bar: Bar, snap: IndicatorSnapshot) -> Signal | None:
          if not snap.or_complete:
              return None
          if bar.close <= snap.vwap:
              return None
          if snap.distance_from_vwap_pct > self.cfg.max_distance_from_vwap_pct:
              return None
          if snap.prior_bar_close is None or bar.close <= snap.prior_bar_close:
              return None
          # Stop: below the pullback low (use bar.low as pullback low) with buffer
          stop = bar.low * (1 - self.cfg.stop.buffer_pct / 100)
          risk_per_share = bar.close - stop
          if risk_per_share <= 0:
              return None
          target = bar.close + self.cfg.target.risk_reward * risk_per_share
          return Signal(
              symbol="SPY", setup="vwap_pullback_long", direction=Direction.LONG,
              timestamp=bar.timestamp, planned_entry=bar.close,
              stop_loss=stop, take_profit=target,
              reason="Close above prior bar high and above VWAP after pullback within threshold",
          )
  ```
  Run T035 — expect PASS. Commit.

### Risk state + sizing

- [ ] T038 [US1] Test: in `backend/tests/test_sizing.py`:
  ```python
  from intraday_trade_spy.risk.sizing import position_size

  def test_position_size_basic():
      assert position_size(account=1000, risk_pct=1.0, entry=500.0, stop=499.0) == 10

  def test_position_size_zero_when_stop_at_entry():
      assert position_size(account=1000, risk_pct=1.0, entry=500.0, stop=500.0) == 0

  def test_position_size_floors():
      # max_risk = 10, risk_per_share = 1.5, raw = 6.66 → 6
      assert position_size(account=1000, risk_pct=1.0, entry=100.0, stop=98.5) == 6
  ```
  Run — expect failure.

- [ ] T039 [US1] Implement `backend/src/intraday_trade_spy/risk/sizing.py`. Surface area:
  ```python
  import math

  def position_size(*, account: float, risk_pct: float, entry: float, stop: float) -> int:
      risk_per_share = entry - stop
      if risk_per_share <= 0:
          return 0
      max_risk = account * (risk_pct / 100)
      return int(math.floor(max_risk / risk_per_share))
  ```
  Run T038 — expect PASS. Commit.

- [ ] T039b [US1] Test: in `backend/tests/test_risk_state.py` (REQUIRED under constitution v1.1.0 principle IV — RiskState is in-scope production code at `backend/src/`):
  ```python
  from datetime import date, datetime
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.risk.state import RiskState

  ET = ZoneInfo("America/New_York")

  def test_roll_to_session_clears_per_day_counters():
      st = RiskState(session_date=date(2026,5,27), account_value=1000.0)
      st.trades_taken_today = 2
      st.daily_realized_pnl = -8.5
      st.daily_lockout_active = True
      st.cooldown_until = datetime(2026,5,27,15,0,tzinfo=ET)
      st.roll_to_session(date(2026,5,28))
      assert st.session_date == date(2026,5,28)
      assert st.trades_taken_today == 0
      assert st.daily_realized_pnl == 0.0
      assert st.daily_lockout_active is False
      assert st.cooldown_until is None

  def test_roll_to_session_is_noop_for_same_date():
      st = RiskState(session_date=date(2026,5,28), account_value=1000.0)
      st.trades_taken_today = 1
      st.roll_to_session(date(2026,5,28))
      assert st.trades_taken_today == 1  # unchanged

  def test_roll_to_session_does_not_clear_consecutive_losses():
      st = RiskState(session_date=date(2026,5,27), account_value=1000.0)
      st.consecutive_losses = 2
      st.roll_to_session(date(2026,5,28))
      assert st.consecutive_losses == 2  # session-spanning state
  ```
  Run `pytest backend/tests/test_risk_state.py -v` — expect failure (`ModuleNotFoundError`).

- [ ] T040 [US1] Implement `backend/src/intraday_trade_spy/risk/state.py`. Surface area:
  ```python
  from dataclasses import dataclass, field
  from datetime import date, datetime
  from intraday_trade_spy.models import Position

  @dataclass
  class RiskState:
      session_date: date
      account_value: float
      trades_taken_today: int = 0
      consecutive_losses: int = 0
      cooldown_until: datetime | None = None
      daily_realized_pnl: float = 0.0
      open_position: Position | None = None
      daily_lockout_active: bool = False

      def roll_to_session(self, new_date: date) -> None:
          if new_date != self.session_date:
              self.session_date = new_date
              self.trades_taken_today = 0
              self.daily_realized_pnl = 0.0
              self.daily_lockout_active = False
              self.cooldown_until = None
  ```
  Run T039b — expect PASS. Commit.

### Risk manager (FR-007, FR-008)

- [ ] T041 [US1] Test: in `backend/tests/test_risk_manager.py`, write at least one test per rejection reason in FR-007. Start with the happy path and the "missing stop" rejection:
  ```python
  from datetime import datetime, date
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.config import Config, MarketConfig, DataConfig, RiskConfig, BrokerConfig
  from intraday_trade_spy.models import Direction, Signal
  from intraday_trade_spy.risk.manager import RiskManager
  from intraday_trade_spy.risk.state import RiskState
  from intraday_trade_spy.clock import MarketClock
  from datetime import time

  ET = ZoneInfo("America/New_York")

  def _cfg():
      return Config(market=MarketConfig(symbol="SPY", session_start="09:30:00", session_end="16:00:00", no_new_trades_after="15:30:00", force_flat_time="15:55:00"), data=DataConfig(csv_path="x", output_dir="y"))

  def _clock():
      return MarketClock(time(9,30), time(16,0), time(15,30), time(15,55))

  def _state():
      return RiskState(session_date=date(2026,5,28), account_value=1000.0)

  def _sig(entry=500.0, stop=499.0, target=502.0):
      return Signal(symbol="SPY", setup="vwap_pullback_long", direction=Direction.LONG,
                    timestamp=datetime(2026,5,28,10,15,tzinfo=ET), planned_entry=entry, stop_loss=stop, take_profit=target, reason="x")

  def test_approves_clean_signal():
      mgr = RiskManager(_cfg(), _clock())
      dec = mgr.validate(_sig(), _state())
      assert dec.approved is True
      assert dec.quantity == 10

  def test_rejects_daily_loss_limit():
      cfg = _cfg()
      mgr = RiskManager(cfg, _clock())
      st = _state()
      st.daily_realized_pnl = -25.0  # > 2% of 1000
      st.daily_lockout_active = True
      dec = mgr.validate(_sig(), st)
      assert dec.approved is False
      assert dec.reason == "daily_loss_limit_reached"
  ```
  Add tests for each of: `max_trades_per_day_reached`, `consecutive_losses_reached`, `cooldown_active`, `position_already_open`, `no_new_trades_after`, `position_size_zero`, `position_value_exceeds_cap`. Run — expect failures.

- [ ] T042 [US1] Implement `backend/src/intraday_trade_spy/risk/manager.py`. Surface area:
  ```python
  from intraday_trade_spy.clock import MarketClock
  from intraday_trade_spy.config import Config
  from intraday_trade_spy.models import RiskDecision, Signal
  from intraday_trade_spy.risk.sizing import position_size
  from intraday_trade_spy.risk.state import RiskState

  class RiskManager:
      def __init__(self, cfg: Config, clock: MarketClock) -> None:
          self.cfg = cfg
          self.clock = clock

      def validate(self, sig: Signal, state: RiskState) -> RiskDecision:
          r = self.cfg.risk
          if sig.symbol != "SPY":
              return RiskDecision(approved=False, reason="non_spy_symbol")
          if state.open_position is not None:
              return RiskDecision(approved=False, reason="position_already_open")
          if state.daily_lockout_active or state.daily_realized_pnl <= -r.account_value * r.max_daily_loss_pct / 100:
              return RiskDecision(approved=False, reason="daily_loss_limit_reached")
          if state.trades_taken_today >= r.max_trades_per_day:
              return RiskDecision(approved=False, reason="max_trades_per_day_reached")
          if state.consecutive_losses >= r.max_consecutive_losses:
              return RiskDecision(approved=False, reason="consecutive_losses_reached")
          if state.cooldown_until is not None and sig.timestamp < state.cooldown_until:
              return RiskDecision(approved=False, reason="cooldown_active")
          if not self.clock.allow_new_trades(sig.timestamp):
              return RiskDecision(approved=False, reason="no_new_trades_after")
          qty = position_size(account=r.account_value, risk_pct=r.max_risk_per_trade_pct,
                              entry=sig.planned_entry, stop=sig.stop_loss)
          if qty <= 0:
              return RiskDecision(approved=False, reason="position_size_zero")
          if qty * sig.planned_entry > r.account_value * r.max_position_value_pct / 100:
              return RiskDecision(approved=False, reason="position_value_exceeds_cap")
          risk_dollars = qty * (sig.planned_entry - sig.stop_loss)
          return RiskDecision(approved=True, reason="approved", quantity=qty, planned_risk_dollars=risk_dollars)
  ```
  Run T041 — expect PASS. Commit.

### Paper broker (FR-009, FR-010, FR-011)

- [ ] T043 [US1] Test: in `backend/tests/test_paper_broker.py`:
  ```python
  from datetime import datetime, date
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.broker.paper import PaperBroker
  from intraday_trade_spy.models import Bar, Direction, Signal, TradePlan

  ET = ZoneInfo("America/New_York")

  def _bar(ts, o, h, l, c):
      return Bar(symbol="SPY", timestamp=ts, open=o, high=h, low=l, close=c, volume=1, session_date=ts.date())

  def _plan(entry=500.0, stop=499.0, target=502.0, qty=10):
      sig = Signal(symbol="SPY", setup="vwap_pullback_long", direction=Direction.LONG,
                   timestamp=datetime(2026,5,28,10,15,tzinfo=ET),
                   planned_entry=entry, stop_loss=stop, take_profit=target, reason="x")
      return TradePlan(signal=sig, quantity=qty, planned_risk_dollars=qty*(entry-stop))

  def test_entry_fills_on_next_bar_open():
      brk = PaperBroker()
      pos = brk.simulate_entry(_plan(), next_bar=_bar(datetime(2026,5,28,10,20,tzinfo=ET), 500.5, 501, 500.4, 500.8))
      assert pos.entry_price == 500.5

  def test_stop_fills_before_target_when_both_hit_same_bar():
      brk = PaperBroker()
      plan = _plan(entry=500, stop=499, target=502, qty=10)
      pos = brk.simulate_entry(plan, next_bar=_bar(datetime(2026,5,28,10,20,tzinfo=ET), 500, 500.1, 499.9, 500.05))
      pos = brk.simulate_bar(pos, _bar(datetime(2026,5,28,10,25,tzinfo=ET), 500, 502.5, 498.5, 501))
      assert pos.exit_reason == "stop"
      assert pos.same_bar_tiebreak == "stop_first"
  ```
  Run — expect failure.

- [ ] T044 [US1] Implement `backend/src/intraday_trade_spy/broker/base.py`. Surface area:
  ```python
  from typing import Protocol
  from intraday_trade_spy.models import Bar, Position, TradePlan

  class Broker(Protocol):
      def simulate_entry(self, plan: TradePlan, *, next_bar: Bar) -> Position: ...
      def simulate_bar(self, position: Position, bar: Bar) -> Position: ...
  ```

- [ ] T045 [US1] Implement `backend/src/intraday_trade_spy/broker/paper.py`. Surface area:
  ```python
  from intraday_trade_spy.models import Bar, Position, TradePlan

  class PaperBroker:
      def simulate_entry(self, plan: TradePlan, *, next_bar: Bar) -> Position:
          assert plan.quantity > 0
          return Position(plan=plan, entry_timestamp=next_bar.timestamp, entry_price=next_bar.open)

      def simulate_bar(self, position: Position, bar: Bar) -> Position:
          if position.exit_timestamp is not None:
              return position
          stop = position.plan.signal.stop_loss
          target = position.plan.signal.take_profit
          hit_stop = bar.low <= stop
          hit_target = bar.high >= target
          if hit_stop and hit_target:
              # Conservative: stop first (FR-009)
              return position.model_copy(update=dict(
                  exit_timestamp=bar.timestamp, exit_price=stop, exit_reason="stop",
                  realized_pnl=(stop - position.entry_price) * position.plan.quantity,
                  realized_r=(stop - position.entry_price) / (position.entry_price - stop) if position.entry_price != stop else 0.0,
                  same_bar_tiebreak="stop_first",
              ))
          if hit_stop:
              return position.model_copy(update=dict(
                  exit_timestamp=bar.timestamp, exit_price=stop, exit_reason="stop",
                  realized_pnl=(stop - position.entry_price) * position.plan.quantity,
                  realized_r=-1.0,
              ))
          if hit_target:
              return position.model_copy(update=dict(
                  exit_timestamp=bar.timestamp, exit_price=target, exit_reason="target",
                  realized_pnl=(target - position.entry_price) * position.plan.quantity,
                  realized_r=(target - position.entry_price) / (position.entry_price - stop),
              ))
          return position

      def force_flat(self, position: Position, next_bar: Bar) -> Position:
          if position.exit_timestamp is not None:
              return position
          return position.model_copy(update=dict(
              exit_timestamp=next_bar.timestamp, exit_price=next_bar.open, exit_reason="force_flat",
              realized_pnl=(next_bar.open - position.entry_price) * position.plan.quantity,
              realized_r=(next_bar.open - position.entry_price) / (position.entry_price - position.plan.signal.stop_loss),
          ))
  ```
  Run T043 — expect PASS. Commit.

### Backtest engine

- [ ] T046 [US1] Test: in `backend/tests/test_backtest_engine.py`:
  ```python
  from intraday_trade_spy.backtest.engine import BacktestEngine
  from intraday_trade_spy.config import load_config

  def test_engine_runs_on_fixture(default_config_path, sample_csv_path, tmp_path):
      cfg = load_config(default_config_path)
      eng = BacktestEngine(cfg)
      result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
      assert any(r.status.value == "emitted" for r in result.journal_rows)
      assert any(r.status.value == "rejected" for r in result.journal_rows)
      assert result.summary.total_trades >= 0
  ```
  Run — expect failure.

- [ ] T047 [US1] Implement `backend/src/intraday_trade_spy/backtest/engine.py`. Surface area:
  ```python
  from dataclasses import dataclass
  from pathlib import Path
  from intraday_trade_spy.config import Config
  from intraday_trade_spy.clock import MarketClock
  from intraday_trade_spy.data.loader import load_bars
  from intraday_trade_spy.data.bars import BarIterator
  from intraday_trade_spy.data.indicators import attach_indicators, snapshot_from_row
  from intraday_trade_spy.strategy.vwap_pullback import VwapPullbackLong
  from intraday_trade_spy.risk.manager import RiskManager
  from intraday_trade_spy.risk.state import RiskState
  from intraday_trade_spy.broker.paper import PaperBroker
  from intraday_trade_spy.journal.logger import JournalLogger
  from intraday_trade_spy.models import JournalEntry, SignalStatus, TradePlan, BacktestRun
  from datetime import time
  from datetime import datetime, timezone

  @dataclass
  class BacktestResult:
      journal_rows: list
      summary: object  # SummaryMetrics, computed by metrics.py
      run: BacktestRun

  class BacktestEngine:
      def __init__(self, cfg: Config) -> None:
          self.cfg = cfg
          self.clock = MarketClock(
              session_start=time.fromisoformat(cfg.market.session_start),
              session_end=time.fromisoformat(cfg.market.session_end),
              no_new_trades_after=time.fromisoformat(cfg.market.no_new_trades_after),
              force_flat_time=time.fromisoformat(cfg.market.force_flat_time),
          )
          self.strategy = VwapPullbackLong(cfg.strategy.vwap_pullback)
          self.risk = RiskManager(cfg, self.clock)
          self.broker = PaperBroker()

      def run(self, *, csv_path: Path, output_dir: Path):
          from intraday_trade_spy.backtest.manifest import build_run
          from intraday_trade_spy.backtest.metrics import compute_summary
          started = datetime.now(timezone.utc)
          df = load_bars(csv_path, market=self.cfg.market)
          df = attach_indicators(df, or_minutes=self.cfg.strategy.opening_range.minutes)
          rows = df.to_dict("records")
          state = RiskState(session_date=df.iloc[0]["session_date"], account_value=self.cfg.risk.account_value)
          log = JournalLogger()
          prev_bar = None
          for idx, row in enumerate(rows):
              bar = next(iter(BarIterator(df.iloc[idx:idx+1])))
              state.roll_to_session(bar.session_date)
              snap = snapshot_from_row(row)
              # 1) Manage open position with this bar (stop / target / force-flat)
              if state.open_position is not None:
                  state.open_position = self.broker.simulate_bar(state.open_position, bar)
                  if state.open_position.exit_timestamp is not None:
                      self._log_exit(log, state.open_position, snap)
                      self._apply_exit_to_state(state, state.open_position)
                      state.open_position = None
              if self.clock.is_force_flat(bar.timestamp) and state.open_position is not None and idx + 1 < len(rows):
                  next_bar = next(iter(BarIterator(df.iloc[idx+1:idx+2])))
                  state.open_position = self.broker.force_flat(state.open_position, next_bar)
                  self._log_exit(log, state.open_position, snap)
                  self._apply_exit_to_state(state, state.open_position)
                  state.open_position = None
              # 2) Strategy emits candidate
              sig = self.strategy.evaluate(bar, snap)
              if sig is not None:
                  self._log_signal(log, sig, snap, SignalStatus.EMITTED)
                  decision = self.risk.validate(sig, state)
                  if decision.approved:
                      self._log_signal(log, sig, snap, SignalStatus.APPROVED, decision=decision)
                      if idx + 1 < len(rows):
                          next_bar = next(iter(BarIterator(df.iloc[idx+1:idx+2])))
                          plan = TradePlan(signal=sig, quantity=decision.quantity, planned_risk_dollars=decision.planned_risk_dollars)
                          state.open_position = self.broker.simulate_entry(plan, next_bar=next_bar)
                          state.trades_taken_today += 1
                          self._log_signal(log, sig, snap, SignalStatus.EXECUTED, decision=decision, actual_entry=state.open_position.entry_price)
                  else:
                      self._log_signal(log, sig, snap, SignalStatus.REJECTED, rejection_check=decision.reason)
              prev_bar = bar
          ended = datetime.now(timezone.utc)
          summary = compute_summary(log.rows())
          run = build_run(csv_path=csv_path, cfg=self.cfg, summary=summary, started=started, ended=ended)
          return BacktestResult(journal_rows=log.rows(), summary=summary, run=run)

      def _log_signal(self, log, sig, snap, status, *, decision=None, actual_entry=None, rejection_check=None):
          log.log(
              status=status, timestamp=sig.timestamp,
              setup=sig.setup, direction=sig.direction,
              planned_entry=sig.planned_entry, stop_loss=sig.stop_loss, take_profit=sig.take_profit,
              quantity=(decision.quantity if decision else None),
              planned_risk_dollars=(decision.planned_risk_dollars if decision else None),
              actual_entry=actual_entry,
              vwap=snap.vwap, or_high=snap.or_high, or_low=snap.or_low,
              distance_from_vwap_pct=snap.distance_from_vwap_pct, prior_bar_close=snap.prior_bar_close,
              reason=sig.reason, rejection_check=rejection_check,
          )

      def _log_exit(self, log, pos, snap):
          from intraday_trade_spy.models import SignalStatus
          status = SignalStatus.FORCE_FLAT if pos.exit_reason == "force_flat" else SignalStatus.EXITED
          log.log(
              status=status, timestamp=pos.exit_timestamp,
              setup=pos.plan.signal.setup, direction=pos.plan.signal.direction,
              planned_entry=pos.plan.signal.planned_entry, stop_loss=pos.plan.signal.stop_loss,
              take_profit=pos.plan.signal.take_profit, quantity=pos.plan.quantity,
              planned_risk_dollars=pos.plan.planned_risk_dollars,
              actual_entry=pos.entry_price, actual_exit=pos.exit_price, exit_reason=pos.exit_reason,
              realized_pnl=pos.realized_pnl, realized_r=pos.realized_r,
              vwap=snap.vwap, or_high=snap.or_high, or_low=snap.or_low,
              distance_from_vwap_pct=snap.distance_from_vwap_pct, prior_bar_close=snap.prior_bar_close,
              reason=f"Exit via {pos.exit_reason}", same_bar_tiebreak=pos.same_bar_tiebreak,
          )

      def _apply_exit_to_state(self, state, pos):
          state.daily_realized_pnl += pos.realized_pnl
          if pos.realized_pnl < 0:
              state.consecutive_losses += 1
              from datetime import timedelta
              state.cooldown_until = pos.exit_timestamp + timedelta(minutes=self.cfg.risk.cooldown_after_loss_minutes)
          else:
              state.consecutive_losses = 0
          # Daily lockout check
          if state.daily_realized_pnl <= -state.account_value * self.cfg.risk.max_daily_loss_pct / 100:
              state.daily_lockout_active = True
  ```
  Run T046 — expect PASS. Commit.

### Backtest metrics + manifest

- [ ] T048 [US1] Test: in `backend/tests/test_metrics.py`:
  ```python
  from intraday_trade_spy.backtest.metrics import compute_summary
  from intraday_trade_spy.models import JournalEntry, SignalStatus, Direction
  from datetime import datetime
  from zoneinfo import ZoneInfo

  ET = ZoneInfo("America/New_York")

  def test_summary_empty_journal():
      s = compute_summary([])
      assert s.total_trades == 0
      assert s.win_rate == 0.0
      assert s.profit_factor is None
  ```
  Run — expect failure.

- [ ] T049 [US1] Implement `backend/src/intraday_trade_spy/backtest/metrics.py`. Surface area:
  ```python
  from collections import Counter
  from intraday_trade_spy.models import JournalEntry, SignalStatus, SummaryMetrics

  def compute_summary(rows: list[JournalEntry]) -> SummaryMetrics:
      executed = [r for r in rows if r.status == SignalStatus.EXECUTED]
      exited = [r for r in rows if r.status == SignalStatus.EXITED]
      wins = [r for r in exited if r.exit_reason == "target"]
      losses = [r for r in exited if r.exit_reason == "stop"]
      rejections = [r for r in rows if r.status == SignalStatus.REJECTED]
      total_trades = len(executed)
      win_rate = (len(wins) / total_trades) if total_trades else 0.0
      avg_win_r = sum(r.realized_r for r in wins) / len(wins) if wins else 0.0
      avg_loss_r = sum(r.realized_r for r in losses) / len(losses) if losses else 0.0
      all_r = [r.realized_r for r in exited if r.realized_r is not None]
      avg_r = sum(all_r) / len(all_r) if all_r else 0.0
      total_r = sum(all_r)
      pf: float | None = None
      if wins and losses:
          pf = sum(r.realized_r for r in wins) / abs(sum(r.realized_r for r in losses))
      elif wins and not losses:
          pf = None
      # Max drawdown over cumulative R
      cum = 0.0; peak = 0.0; max_dd = 0.0
      for r in all_r:
          cum += r
          peak = max(peak, cum)
          max_dd = min(max_dd, cum - peak)
      best = max(all_r) if all_r else None
      worst = min(all_r) if all_r else None
      streak = cur = 0
      for r in exited:
          if r.exit_reason == "stop":
              cur += 1
              streak = max(streak, cur)
          else:
              cur = 0
      breakdown = dict(Counter(r.rejection_check for r in rejections if r.rejection_check))
      return SummaryMetrics(
          total_trades=total_trades, wins=len(wins), losses=len(losses), win_rate=win_rate,
          average_win_r=avg_win_r, average_loss_r=avg_loss_r, average_r=avg_r, total_r=total_r,
          profit_factor=pf, max_drawdown_r=max_dd,
          best_trade_r=best, worst_trade_r=worst, longest_consecutive_loss_streak=streak,
          rejected_signal_count=len(rejections), rejection_breakdown=breakdown,
      )
  ```
  Run T048 — expect PASS. Commit.

- [ ] T050 [US1] Test: in `backend/tests/test_manifest.py`:
  ```python
  from intraday_trade_spy.backtest.manifest import build_run
  from intraday_trade_spy.config import load_config
  from intraday_trade_spy.backtest.metrics import compute_summary
  from datetime import datetime, timezone

  def test_manifest_has_required_fields(default_config_path, sample_csv_path):
      cfg = load_config(default_config_path)
      run = build_run(csv_path=sample_csv_path, cfg=cfg, summary=compute_summary([]),
                      started=datetime.now(timezone.utc), ended=datetime.now(timezone.utc))
      assert len(run.data_fingerprint.sha256) == 64
      assert run.code_version  # non-empty
      assert run.run_id
  ```
  Run — expect failure.

- [ ] T051 [US1] Implement `backend/src/intraday_trade_spy/backtest/manifest.py`. Surface area:
  ```python
  import subprocess
  from datetime import datetime
  from pathlib import Path
  from intraday_trade_spy.config import Config
  from intraday_trade_spy.data.fingerprint import fingerprint_csv
  from intraday_trade_spy.models import BacktestRun, SummaryMetrics

  def _code_version() -> str:
      try:
          out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=2)
          return out.stdout.strip() or "unversioned"
      except Exception:
          return "unversioned"

  def build_run(*, csv_path: Path, cfg: Config, summary: SummaryMetrics, started: datetime, ended: datetime) -> BacktestRun:
      fp = fingerprint_csv(csv_path)
      run_id = f"{started.strftime('%Y%m%d-%H%M%S')}-{fp.sha256[:8]}"
      return BacktestRun(
          run_id=run_id, run_started_at=started, run_ended_at=ended,
          code_version=_code_version(),
          config_snapshot=cfg.model_dump(mode="json"),
          data_fingerprint=fp, summary=summary,
      )

  def write_run_yaml(run: BacktestRun, path: Path) -> None:
      import yaml
      payload = run.model_dump(mode="json")
      path.write_text(yaml.safe_dump(payload, sort_keys=True, default_flow_style=False))
  ```
  Run T050 — expect PASS. Commit.

### CLI (`run_backtest`)

- [ ] T052 [US1] Test: in `backend/tests/test_cli.py`:
  ```python
  import subprocess, sys
  from pathlib import Path

  def test_cli_end_to_end(tmp_path, default_config_path):
      out = tmp_path / "out"
      result = subprocess.run([sys.executable, "-m", "intraday_trade_spy.cli.run_backtest",
                               "--config", str(default_config_path), "--out", str(out)],
                              capture_output=True, text=True)
      assert result.returncode == 0, result.stderr
      runs = list(out.iterdir())
      assert len(runs) == 1
      assert (runs[0] / "journal.csv").exists()
      assert (runs[0] / "summary.json").exists()
      assert (runs[0] / "run.yaml").exists()
  ```
  Run — expect failure.

- [ ] T053 [US1] Implement `backend/src/intraday_trade_spy/cli/run_backtest.py`. Surface area:
  ```python
  import argparse, json, sys
  from pathlib import Path
  from intraday_trade_spy.config import load_config
  from intraday_trade_spy.backtest.engine import BacktestEngine
  from intraday_trade_spy.backtest.manifest import write_run_yaml
  from intraday_trade_spy.journal.exporter import write_journal_csv

  def main(argv: list[str] | None = None) -> int:
      p = argparse.ArgumentParser(prog="intraday-trade-spy-backtest")
      p.add_argument("--config", required=True)
      p.add_argument("--data", default=None)
      p.add_argument("--out", default=None)
      p.add_argument("--quiet", action="store_true")
      args = p.parse_args(argv)
      try:
          cfg = load_config(args.config)
      except Exception as e:
          print(f"config error: {e}", file=sys.stderr); return 2
      data_path = Path(args.data or cfg.data.csv_path)
      out_dir = Path(args.out or cfg.data.output_dir)
      out_dir.mkdir(parents=True, exist_ok=True)
      engine = BacktestEngine(cfg)
      result = engine.run(csv_path=data_path, output_dir=out_dir)
      run_dir = out_dir / result.run.run_id
      run_dir.mkdir(parents=True, exist_ok=True)
      write_journal_csv(result.journal_rows, run_dir / "journal.csv")
      (run_dir / "summary.json").write_text(json.dumps(result.summary.model_dump(), indent=2, sort_keys=True, ensure_ascii=False) + "\n")
      write_run_yaml(result.run, run_dir / "run.yaml")
      if not args.quiet:
          print(f"Loaded {result.run.data_fingerprint.bar_count} bars from {data_path}")
          for r in result.journal_rows:
              print(f"{r.timestamp.isoformat()} {r.status.value:10} {r.reason}")
          print("=== SUMMARY ===")
          print(json.dumps(result.summary.model_dump(), indent=2, sort_keys=True))
          print(f"Wrote run to {run_dir}")
      return 0

  if __name__ == "__main__":
      raise SystemExit(main())
  ```

- [ ] T054 [US1] Create the thin script wrapper at `backend/scripts/run_backtest.py`:
  ```python
  import sys
  from intraday_trade_spy.cli.run_backtest import main
  if __name__ == "__main__":
      raise SystemExit(main(sys.argv[1:]))
  ```
  Run T052 — expect PASS. Commit.

**Checkpoint (Phase 3 — MVP complete)**: Run
`python -m intraday_trade_spy.cli.run_backtest --config backend/config/config.yaml --out /tmp/itspy-run`.
The command exits 0; stdout contains `=== SUMMARY ===`; the run dir
contains `journal.csv`, `summary.json`, and `run.yaml`. **This is the
demo-ready MVP.**

---

## Phase 4: User Story 2 — Explain every signal/rejection (Priority: P2)

**Goal**: Every journal row carries the indicator snapshot at decision
time and (for rejections) a `rejection_check` naming the FR-007 check
that failed.

**Independent Test**: Pick any row of `journal.csv`. Using only the row
and the spec, write one sentence explaining the system's decision at
that moment.

- [ ] T055 [US2] Verification test: in `backend/tests/test_journal.py`, add `test_every_row_has_snapshot_and_reason`:
  ```python
  from intraday_trade_spy.backtest.engine import BacktestEngine
  from intraday_trade_spy.config import load_config

  def test_every_row_has_snapshot_and_reason(default_config_path, sample_csv_path, tmp_path):
      cfg = load_config(default_config_path)
      eng = BacktestEngine(cfg)
      result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
      for r in result.journal_rows:
          assert r.reason
          assert r.vwap is not None
          if r.status.value == "rejected":
              assert r.rejection_check
  ```
  Run — should PASS already if Phase 3 is correct. If not, fix the engine `_log_signal` / `_log_exit` calls to populate `vwap` for every row including `lockout`. Commit.

- [ ] T056 [US2] Test: complete the per-rejection-reason coverage in `backend/tests/test_risk_manager.py`. For each of the remaining FR-007 reasons not yet covered in T041, add an explicit `test_rejects_<reason>` case. Required minimum set: `position_already_open`, `cooldown_active`, `no_new_trades_after`, `position_size_zero`, `position_value_exceeds_cap`. Run all — expect PASS.

- [ ] T057 [US2] Test: in `backend/tests/test_backtest_engine.py`, add `test_lockout_logged_on_daily_loss_hit`:
  ```python
  def test_lockout_logged_on_daily_loss_hit(default_config_path, sample_csv_path, tmp_path):
      from intraday_trade_spy.backtest.engine import BacktestEngine
      from intraday_trade_spy.config import load_config
      cfg = load_config(default_config_path)
      eng = BacktestEngine(cfg)
      result = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
      rejections = [r for r in result.journal_rows if r.status.value == "rejected"]
      reasons = {r.rejection_check for r in rejections}
      # The fixture is built to include at least one of these:
      assert reasons & {"daily_loss_limit_reached", "max_trades_per_day_reached"}
  ```
  If the fixture authored in T009 doesn't produce a rejection in this set, augment the fixture (add a session with two losses before the third signal) and rerun. Commit.

**Checkpoint (Phase 4)**: Open `journal.csv` from the demo run. Every
row's `reason` field is non-empty. Every `rejected` row has a populated
`rejection_check`. Every row has VWAP, OR levels, and distance.

---

## Phase 5: User Story 3 — Configure without touching code (Priority: P3)

**Goal**: Changing any single config field listed in spec acceptance
scenario US3-1 produces a deterministic, explainable change in the
journal output.

- [ ] T058 [US3] Test: in `backend/tests/test_config_knobs.py`, add a parametrized test:
  ```python
  import copy, json, yaml
  import pytest
  from pathlib import Path
  from intraday_trade_spy.config import Config, load_config
  from intraday_trade_spy.backtest.engine import BacktestEngine

  CHANGES = [
      ("risk.max_risk_per_trade_pct", 0.5),
      ("risk.max_trades_per_day", 1),
      ("strategy.opening_range.minutes", 30),
      ("strategy.vwap_pullback.max_distance_from_vwap_pct", 0.10),
      ("strategy.vwap_pullback.target.risk_reward", 1.0),
      ("market.force_flat_time", "15:30:00"),
  ]

  @pytest.mark.parametrize("dotted,value", CHANGES)
  def test_config_knob_changes_journal(default_config_path, sample_csv_path, tmp_path, dotted, value):
      def _run(cfg: Config) -> list[str]:
          eng = BacktestEngine(cfg)
          res = eng.run(csv_path=sample_csv_path, output_dir=tmp_path)
          return [f"{r.timestamp.isoformat()},{r.status.value},{r.quantity},{r.rejection_check or ''}" for r in res.journal_rows]
      base = load_config(default_config_path)
      modified_raw = yaml.safe_load(Path(default_config_path).read_text())
      d = modified_raw
      parts = dotted.split(".")
      for p in parts[:-1]:
          d = d[p]
      d[parts[-1]] = value
      modified = Config.model_validate(modified_raw)
      assert _run(base) != _run(modified), f"changing {dotted} did not change journal"
  ```
  Run — some cases may need the fixture to be sensitive to the knob. If a case fails because the fixture is unaffected, augment the fixture so the change visibly matters. Commit.

- [ ] T059 [US3] Test: in `backend/tests/test_default_config_blocks_live.py`:
  ```python
  import pytest
  from pydantic import ValidationError
  from intraday_trade_spy.config import Config

  def test_default_config_has_live_disabled(default_config_path):
      from intraday_trade_spy.config import load_config
      cfg = load_config(default_config_path)
      assert cfg.broker.live_auto_enabled is False

  def test_attempt_to_enable_live_fails_validation():
      with pytest.raises(ValidationError):
          Config.model_validate({
              "market": {"symbol": "SPY", "session_start": "09:30:00", "session_end": "16:00:00",
                          "no_new_trades_after": "15:30:00", "force_flat_time": "15:55:00"},
              "data": {"csv_path": "x", "output_dir": "y"},
              "broker": {"provider": "paper", "live_auto_enabled": True},
          })
  ```
  Run — expect PASS (covered by config T016). Commit.

**Checkpoint (Phase 5)**: Manually flip
`risk.max_risk_per_trade_pct: 0.5`, rerun the CLI, diff two run
directories' `journal.csv` files. The diff is non-empty and the
position sizes are halved.

---

## Phase 6: User Story 4 — No future-bar leakage (Priority: P4)

**Goal**: The engine cannot accidentally look at future bars; an
adversarial fixture exists to prove it.

- [ ] T060 [US4] Create the adversarial fixture at `backend/tests/fixtures/adversarial_future_leak.csv`. Design: one session of 5-minute bars where bar N+1's high is huge (e.g., +5%) compared to bar N. A leaking strategy that peeked at bar N+1 would emit a signal at bar N. The correct (non-leaking) engine emits no signal at bar N because bar N's indicators say "no setup." Document the design intent in a comment header (CSV-comment alternative: pair it with `backend/tests/fixtures/adversarial_future_leak.README.md` explaining the leak hypothesis and the expected non-leaking behavior).

- [ ] T061 [US4] Test: in `backend/tests/test_backtest_engine.py`, add `test_no_future_bar_leakage`:
  ```python
  def test_no_future_bar_leakage(default_config_path, adversarial_future_leak_csv_path, tmp_path):
      from intraday_trade_spy.backtest.engine import BacktestEngine
      from intraday_trade_spy.config import load_config
      cfg = load_config(default_config_path)
      eng = BacktestEngine(cfg)
      result = eng.run(csv_path=adversarial_future_leak_csv_path, output_dir=tmp_path)
      # No signal should appear in the "trap" bar's timestamp (documented in adversarial_future_leak.README.md)
      trap_ts = "2026-06-04T10:15:00-04:00"
      hits = [r for r in result.journal_rows if r.status.value == "emitted" and r.timestamp.isoformat() == trap_ts]
      assert not hits, f"future-bar leak detected at {trap_ts}"
  ```
  Run — expect PASS (BarIterator's structural guard ensures this). If it fails, the strategy or indicators are reading from a bar with a larger timestamp than the current bar — fix.

- [ ] T062 [US4] Test: in `backend/tests/test_backtest_engine.py`, add `test_engine_rejects_out_of_order_bars`:
  ```python
  def test_engine_rejects_out_of_order_bars(default_config_path, tmp_path):
      from intraday_trade_spy.backtest.engine import BacktestEngine
      from intraday_trade_spy.config import load_config
      bad = tmp_path / "ooo.csv"
      bad.write_text("symbol,timestamp,open,high,low,close,volume\n"
                     "SPY,2026-05-28T10:00:00-04:00,1,1,1,1,1\n"
                     "SPY,2026-05-28T09:55:00-04:00,1,1,1,1,1\n")
      cfg = load_config(default_config_path)
      eng = BacktestEngine(cfg)
      import pytest
      # The loader sorts by timestamp; assert that even pathological inputs are processed monotonically.
      result = eng.run(csv_path=bad, output_dir=tmp_path)
      timestamps = [r.timestamp for r in result.journal_rows]
      assert timestamps == sorted(timestamps)
  ```
  Run — expect PASS. Commit.

**Checkpoint (Phase 6)**: `pytest backend/tests/test_backtest_engine.py -v` green. Manually inspect `adversarial_future_leak.README.md` and confirm the trap-bar logic is documented in plain English.

---

## Phase 7: User Story 5 — Reproducible runs (Priority: P5)

**Goal**: Re-running with identical config and identical data produces
byte-identical `journal.csv`.

- [ ] T063 [US5] Test: in `backend/tests/test_reproducibility.py`:
  ```python
  import subprocess, sys
  from pathlib import Path

  def test_three_runs_byte_identical(tmp_path, default_config_path):
      out = tmp_path / "out"
      hashes = []
      for _ in range(3):
          subprocess.run([sys.executable, "-m", "intraday_trade_spy.cli.run_backtest",
                          "--config", str(default_config_path), "--out", str(out), "--quiet"],
                          check=True)
      # Three subdirectories — compare their journal.csv files
      runs = sorted(out.iterdir())
      assert len(runs) == 3
      contents = [(r / "journal.csv").read_bytes() for r in runs]
      assert contents[0] == contents[1] == contents[2]
  ```
  Run — expect PASS. If it fails, the journal exporter (T025) or the engine ordering is non-deterministic; fix by sorting strictly per `journal-csv-schema.md`.

- [ ] T064 [US5] Test: in `backend/tests/test_manifest.py`, add `test_run_yaml_has_fingerprint_and_resolved_config`:
  ```python
  import subprocess, sys, yaml
  def test_run_yaml_has_fingerprint_and_resolved_config(tmp_path, default_config_path):
      out = tmp_path / "out"
      subprocess.run([sys.executable, "-m", "intraday_trade_spy.cli.run_backtest",
                      "--config", str(default_config_path), "--out", str(out), "--quiet"],
                      check=True)
      run_dir = next(iter(out.iterdir()))
      data = yaml.safe_load((run_dir / "run.yaml").read_text())
      assert "data_fingerprint" in data
      assert len(data["data_fingerprint"]["sha256"]) == 64
      assert data["resolved_config"]["market"]["symbol"] == "SPY"
      assert data["resolved_config"]["broker"]["live_auto_enabled"] is False
  ```
  Run — expect PASS. Commit.

**Checkpoint (Phase 7)**: `pytest backend/tests/test_reproducibility.py backend/tests/test_manifest.py -v` green.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T065 [P] Polish the stdout summary formatter in `backend/src/intraday_trade_spy/cli/run_backtest.py`. Replace the raw JSON dump with a readable table. Don't change behavior of `journal.csv`, `summary.json`, or `run.yaml` (covered by reproducibility test). Verify visually with `python -m intraday_trade_spy.cli.run_backtest --config backend/config/config.yaml`.

- [ ] T066 [P] Expand the backend README at `backend/README.md` to include the dev quickstart sequence (mirror of `specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md` with absolute repo paths).

- [ ] T067 [P] Expand the root README at `README.md` to add: a one-paragraph project summary, the constitution link, an explicit "v1 = backtest only" callout, and a link to the active spec.

- [ ] T068 Run `ruff check backend/src backend/tests && ruff format --check backend/src backend/tests`. Fix any findings. Re-run until clean.

- [ ] T069 Run `pytest --cov=intraday_trade_spy --cov-report=term-missing backend/tests`. Confirm coverage for `strategy/`, `risk/`, `broker/`, `backtest/`, `journal/`, and `data/indicators.py` is 100% (spec SC-002). If any uncovered branch exists, add a test for it.

- [ ] T070 Run the quickstart end-to-end on a clean shell (no editable install yet): `cd backend && python -m venv .venv2 && source .venv2/bin/activate && pip install -e ".[dev]"`. Then `python -m intraday_trade_spy.cli.run_backtest --config config/config.yaml`. Confirm it completes in under 5 seconds (spec SC-001 performance bound is 5 minutes incl. install; this measures pure execution).

**Checkpoint (Phase 8)**: All tests green. Ruff clean. Coverage targets
met. Quickstart confirmed in under 5 minutes from a fresh shell.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no upstream dependencies; can start immediately.
- **Phase 2 (Foundational)** — depends on Phase 1; **blocks every user story**.
- **Phase 3 (US1)** — depends on Phase 2. Once green, this is the demo-ready MVP.
- **Phase 4 (US2)** — depends on Phase 3 (refines the journal that Phase 3 emits).
- **Phase 5 (US3)** — depends on Phase 4 (config-knob tests assume the journal carries enough detail to detect differences).
- **Phase 6 (US4)** — depends on Phase 3 (engine exists). Independent of Phases 4 and 5.
- **Phase 7 (US5)** — depends on Phase 6 (writes reproducibility tests that exercise the same engine surface).
- **Phase 8 (Polish)** — depends on all user-story phases being complete.

### Inside each phase

- TDD-mandatory tasks (those preceded by `Test:`) MUST be completed in test-then-implementation order. Don't skip the failing-test step — it's the spec for the implementation.
- Tasks within a phase that touch DIFFERENT files and have NO producer/consumer link can run in parallel (tagged `[P]`).
- Tasks within a phase that share a file (e.g., multiple tests in the same `test_*.py`) MUST be serialized.

### Suggested branch hygiene

- The branch `001-backtest-mvp-spy-vwap-pullback` is already created.
- Commit after each TDD micro-cycle (typically after step 5).
- After each phase Checkpoint passes, consider pushing.

---

## Parallel Opportunities

### Phase 1 parallel groups

```bash
# Parallel set A (different placeholder files):
Task: "T002 Create root .gitignore"
Task: "T003 Create root .python-version"
Task: "T004 Create frontend/README.md"
Task: "T005 Create docs/README.md"
Task: "T006 Create root README.md stub"

# Parallel set B (after T007 pyproject.toml exists):
Task: "T008 Create backend/README.md"
Task: "T011 Create backend/config/logging.yaml"
Task: "T012 Create backend/tests/conftest.py"
Task: "T013 Create empty __init__.py files in every package"
```

### Phase 2 parallel groups

```bash
# After T016 (config.py) exists, these tests can be written in parallel:
Task: "T015 / T017 test_config.py cases"
Task: "T018 test_models.py initial cases"
Task: "T020 test_clock.py cases"
Task: "T022 test_journal.py logger cases"

# Cross-module impl tasks that touch different files are parallelizable:
Task: "T021 Implement clock.py"
Task: "T023 Implement journal/logger.py"
Task: "T027 Implement data/loader.py"   # after T026 test exists
Task: "T031 Implement data/fingerprint.py"  # after T030 test exists
```

### Phase 3 parallel groups

```bash
# Independent test authoring (different test files):
Task: "T035 [US1] test_vwap_pullback.py"
Task: "T038 [US1] test_sizing.py"
Task: "T043 [US1] test_paper_broker.py"
Task: "T048 [US1] test_metrics.py"
```

### Phase 8 parallel groups

```bash
Task: "T065 Polish stdout summary formatter"
Task: "T066 Expand backend/README.md"
Task: "T067 Expand root README.md"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Complete Phase 1: Setup (T001–T014).
2. Complete Phase 2: Foundational (T015–T034). This is the longest phase — every later story depends on it.
3. Complete Phase 3: User Story 1 (T035–T054).
4. **STOP and VALIDATE**: run the CLI against the bundled fixture and confirm `journal.csv` + `summary.json` + `run.yaml` exist.
5. Demo / share. This is a useful research tool already.

### Incremental delivery

1. After MVP: Phase 4 (US2) — refine the explanation columns. Demo: read any row and explain it in one sentence.
2. Then Phase 5 (US3) — verify config knobs are real. Demo: flip one knob, show the journal differs.
3. Then Phase 6 (US4) — prove no future-bar leakage. Demo: run the adversarial fixture; show no trap-bar signal.
4. Then Phase 7 (US5) — prove reproducibility. Demo: run twice, diff is empty.
5. Then Phase 8 — README polish, ruff clean, coverage targets met, fresh-shell quickstart timed.

### Parallel team strategy

This feature is solo-developable. If two developers exist, Phase 2 can
be split by module ownership: developer A takes `config.py` + `models.py`
+ `clock.py`; developer B takes `data/*.py` + `journal/*.py`. They
converge before Phase 3.

---

## Notes

- Every implementation task whose target is under
  `strategy/`, `risk/`, `broker/`, `backtest/`, `journal/`, or
  `data/indicators.py` has a preceding `Test:` task (constitution
  principle IV).
- Every task names exact file paths — no placeholders.
- Test code skeletons are included in failing-test tasks; implementation
  signatures are included in impl tasks. The engineer is meant to
  expand them with details inferred from `spec.md`, `data-model.md`,
  and the contracts in `contracts/`.
- Commit after each TDD micro-cycle. Don't batch multiple unrelated
  changes into a single commit.
- If any task can't be completed because a file outside the project
  structure tree (plan.md) needs to be created, flag it as a deviation
  and update plan.md before proceeding.
