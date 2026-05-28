import math


def position_size(*, account: float, risk_pct: float, entry: float, stop: float) -> int:
    risk_per_share = entry - stop
    if risk_per_share <= 0:
        return 0
    max_risk = account * (risk_pct / 100)
    return int(math.floor(max_risk / risk_per_share))
