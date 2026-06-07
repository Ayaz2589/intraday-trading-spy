import csv
from pathlib import Path

from intraday_trade_spy.models import JournalEntry, SignalStatus

COLUMNS = [
    "row_seq", "timestamp", "status", "setup", "direction",
    "planned_entry", "stop_loss", "take_profit", "quantity", "planned_risk_dollars",
    "actual_entry", "actual_exit", "exit_reason", "realized_pnl", "realized_r",
    # Feature 010: cost breakdown (constitution VII — explain the net deduction).
    "gross_pnl", "fees", "slippage_cost",
    "vwap", "or_high", "or_low", "distance_from_vwap_pct", "prior_bar_close",
    "reason", "rejection_check", "same_bar_tiebreak",
]

STATUS_PRIORITY = {
    SignalStatus.EMITTED: 0,
    SignalStatus.APPROVED: 1,
    SignalStatus.REJECTED: 1,
    # Feature 020: a window-skip is terminal for its bar, like a rejection.
    SignalStatus.SKIPPED_WINDOW: 1,
    SignalStatus.EXECUTED: 2,
    SignalStatus.EXITED: 3,
    SignalStatus.FORCE_FLAT: 3,
    SignalStatus.LOCKOUT: 4,
}

_FLOAT_FMT = {
    "planned_entry": "{:.4f}", "stop_loss": "{:.4f}", "take_profit": "{:.4f}",
    "planned_risk_dollars": "{:.2f}",
    "actual_entry": "{:.4f}", "actual_exit": "{:.4f}",
    "realized_pnl": "{:.2f}", "realized_r": "{:.3f}",
    "gross_pnl": "{:.2f}", "fees": "{:.2f}", "slippage_cost": "{:.2f}",
    "vwap": "{:.4f}", "or_high": "{:.4f}", "or_low": "{:.4f}",
    "distance_from_vwap_pct": "{:.4f}", "prior_bar_close": "{:.4f}",
}

_ENUM_COLS = {"status", "direction", "exit_reason", "same_bar_tiebreak"}


def _serialize(entry: JournalEntry, col: str) -> str:
    v = getattr(entry, col, None)
    if v is None:
        return ""
    if col == "timestamp":
        return v.isoformat()
    if col in _ENUM_COLS:
        return v.value if hasattr(v, "value") else str(v)
    if col in _FLOAT_FMT:
        return _FLOAT_FMT[col].format(v)
    return str(v)


def journal_dict_rows(entries: list[JournalEntry]) -> list[dict[str, str]]:
    """The exact dict rows a csv.DictReader would yield from write_journal_csv
    output — same sort order, same per-column string serialization. Feature 014
    uses this so the in-memory push path shares one serialization with the CSV
    path (parity-locked in tests/storage/test_build_run_payload.py)."""
    sorted_entries = sorted(
        entries,
        key=lambda e: (e.timestamp.isoformat(), STATUS_PRIORITY[e.status], e.row_seq),
    )
    return [{c: _serialize(e, c) for c in COLUMNS} for e in sorted_entries]


def write_journal_csv(entries: list[JournalEntry], path: Path) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(COLUMNS)
        for row in journal_dict_rows(entries):
            writer.writerow([row[c] for c in COLUMNS])
