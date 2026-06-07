"""Feature 022 — in-memory replay session state + recap aggregation.

`ReplaySession` is the ephemeral state container (meta + pacing); the trading
state lives in the `ReplayEngine` it references. `build_performance` derives the
recap from the engine's closed trades, reusing the live `TradePerformance`
JSON shape so the frontend renders it unchanged. Nothing here is persisted."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from intraday_trade_spy.replay.engine import ReplayEngine

Status = str  # "playing" | "paused" | "completed" | "stopped"


@dataclass
class ReplaySession:
    id: str
    user_id: str
    session_date: date
    config_snapshot: dict
    speed: int
    engine: ReplayEngine
    status: Status = "playing"
    sim_clock: datetime = field(default=None)  # set to session open at start

    def __post_init__(self) -> None:
        if self.sim_clock is None:
            self.sim_clock = self.engine.session_open_time()

    # ---- API state snapshot -------------------------------------------------

    def state_dict(self) -> dict:
        eng = self.engine
        pos = eng.state.open_position
        position = None
        if pos is not None:
            position = {
                "qty": pos.plan.quantity,
                "avg_entry": pos.entry_price,
                "stop_loss": pos.plan.signal.stop_loss,
                "take_profit": pos.plan.signal.take_profit,
                "unrealized_pnl": None,  # mark-to-last handled client-side / optional
            }
        realized = sum((t.realized_pnl or 0.0) for t in eng.trades)
        realized_r = sum((t.realized_r or 0.0) for t in eng.trades)
        return {
            "session": {
                "id": self.id,
                "session_date": self.session_date.isoformat(),
                "status": self.status,
                "automation": eng.automation,
                "speed": self.speed,
                "sim_clock": self.sim_clock.isoformat(),
                "bars_total": eng.bars_total,
                "bars_delivered": eng.delivered,
            },
            "market": {
                "sim_now": self.sim_clock.isoformat(),
                "session_open": eng.session_open_time().isoformat(),
                "session_close": eng.session_close_time().isoformat(),
                "is_simulation": True,
            },
            "position": position,
            "today": {
                "trades": len(eng.trades),
                "realized_pnl": round(realized, 2),
                "realized_r": round(realized_r, 4),
            },
            "account": {
                "sizing_account_value": float(eng.cfg.risk.account_value),
                "equity": round(eng.cfg.risk.account_value + realized, 2),
            },
        }


def build_performance(engine: ReplayEngine) -> dict:
    """Recap metrics + equity curve + per-trade rows from closed trades —
    reuses the live `TradePerformance` shape."""
    trades = engine.trades
    rs = [float(t.realized_r or 0.0) for t in trades]
    pnls = [float(t.gross_pnl or 0.0) for t in trades]
    wins = sum(1 for p in pnls if p > 0)
    n = len(trades)

    start_equity = float(engine.cfg.risk.account_value)
    cum = 0.0
    curve = [{"t": None, "equity": round(start_equity, 2)}]
    rows = []
    for t in trades:
        net = float(t.realized_pnl or 0.0)
        cum += net
        exit_iso = (
            t.exit_timestamp.isoformat() if t.exit_timestamp is not None else None
        )
        curve.append({"t": exit_iso, "equity": round(start_equity + cum, 2)})
        rows.append(
            {
                "origin": _origin_of(t),
                "entry_time": t.entry_timestamp.isoformat(),
                "exit_time": exit_iso,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "exit_reason": t.exit_reason,
                "qty": t.plan.quantity,
                "realized_r": t.realized_r,
                "gross_pnl": t.gross_pnl,
                "realized_pnl": t.realized_pnl,
            }
        )
    return {
        "summary": {
            "trades": n,
            "wins": wins,
            "win_rate": (wins / n) if n else None,
            "expectancy_r": (sum(rs) / n) if n else None,
            "total_r": round(sum(rs), 4),
            "gross_pnl": round(sum(pnls), 2),
        },
        "equity_curve": curve,
        "trades": rows,
    }


def _origin_of(_pos) -> str:
    # Origin isn't carried on Position; the journal records it. Recap rows
    # default to "strategy"; manual trades are distinguishable in the journal.
    return "strategy"
