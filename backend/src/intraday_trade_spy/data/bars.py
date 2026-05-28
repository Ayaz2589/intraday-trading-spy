from typing import Iterator

import pandas as pd

from intraday_trade_spy.models import Bar


class BarIterator:
    def __init__(self, df: pd.DataFrame) -> None:
        self._df = df

    def __iter__(self) -> Iterator[Bar]:
        for row in self._df.itertuples(index=False):
            yield Bar(
                symbol=row.symbol,
                timestamp=row.timestamp,
                open=float(row.open),
                high=float(row.high),
                low=float(row.low),
                close=float(row.close),
                volume=int(row.volume),
                session_date=row.session_date,
            )
