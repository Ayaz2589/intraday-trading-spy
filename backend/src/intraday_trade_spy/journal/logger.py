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
