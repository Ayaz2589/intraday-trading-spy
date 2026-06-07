# Phase 1 Data Model — Entry-Window Filter Knobs (020)

**No database changes.** The knobs live inside the existing config params
JSON; the registry is code; the journal reuses the existing journal_rows
shape with a new status value.

## Config (Pydantic, backend/src/intraday_trade_spy/config.py)

```python
class EntryWindowConfig(BaseModel):
    start_minutes_after_open: int = Field(default=0, ge=0, le=390)
    end_minutes_after_open: int = Field(default=390, ge=0, le=390)
    # model_validator: start < end, else ValueError naming both values (FR-004)

class VwapPullbackConfig(BaseModel):
    ...
    entry_window: EntryWindowConfig = Field(default_factory=EntryWindowConfig)
```

Effective window at runtime (FR-002):
`start_eff = max(opening-range completion, start_minutes_after_open)`,
`end_eff = min(no_new_trades_after, end_minutes_after_open)` — the OR rule
and the risk cutoff are enforced where they already live; the strategy only
adds its own narrower comparison.

## Models (backend/src/intraday_trade_spy/models.py)

```python
class SignalStatus(str, Enum):
    ...
    SKIPPED_WINDOW = "skipped_window"   # setup formed outside the entry window

class WindowSkip(BaseModel):            # frozen
    timestamp: AwareDatetime
    reason: str                          # names the window values + bar minute
    start_minutes_after_open: int
    end_minutes_after_open: int
```

## Clock (backend/src/intraday_trade_spy/clock.py)

```python
def minutes_since_open(self, dt: datetime) -> int:
    """Whole minutes since session_start, in ET. Negative before the open."""
```

## Knob registry (backend/src/intraday_trade_spy/validation/knobs.py)

| path | label | min | max | kind |
|---|---|---|---|---|
| strategy.vwap_pullback.entry_window.start_minutes_after_open | entry window start (min after open) | 0 | 390 | int |
| strategy.vwap_pullback.entry_window.end_minutes_after_open | entry window end (min after open) | 0 | 390 | int |

(Leaves `start_minutes_after_open` / `end_minutes_after_open` are unique —
CLI leaf resolution unaffected.)

## Frontend knob mirror (frontend/src/lib/config-knobs.ts)

- `KnobValues` + `entry_start_minutes` / `entry_end_minutes`
- `KNOB_DEFAULTS`: 0 / 390
- `knobsFromConfig` / `buildParams`: nested path `strategy.vwap_pullback.entry_window.*`
- `KNOB_PATH_LABELS`: the registry labels above
- `configDiffChips` extras: `{label: 'entry from', value: '<n>m'}` / `{label: 'entry until', value: '<n>m'}` (diff-only, accent)
- `SENSITIVITY_KNOBS`: start grid [0, 15, 30, 45]; end grid [240, 270, 300, 390]

## Help content (frontend/src/components/help-content.ts)

`entry_window` (88 → 89 concepts): what (a per-config clamp on when entries
may trigger, in minutes after the 09:30 open), why (the archive shows the
first minutes after the opening range carried the strategy's entire net
loss — chaos, not edge), how (the strategy journals setups outside the
window as skipped instead of trading them; sweeps/campaigns can search the
window like any knob).

## Journal row (unchanged shape)

A SKIPPED_WINDOW row carries the standard indicator context (vwap, or_high/
low, distance, prior close) + `reason` naming the window and the bar's
minute — distinguishable from REJECTED (risk veto) by status.
