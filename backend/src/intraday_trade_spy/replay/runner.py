"""Feature 022 — the replay pacing runner + in-memory registry (research.md R2/R4).

Advances a continuous simulated clock at the chosen speed (simulated
market-seconds per real second) and surfaces stored bars to the engine as the
sim-clock crosses each boundary. Pure `advance(real_seconds)` keeps pacing
deterministically testable; `run()` is the production async loop. The
`REPLAY_RUNNING` registry (one entry per user) is the ephemeral one-active-replay
guard — mirrors `live/runner.py:RUNNING`. Nothing is persisted; a process
restart empties the registry, so a replay is never silently resumed (FR-020)."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from intraday_trade_spy.replay.session import ReplaySession

_log = logging.getLogger(__name__)

# In-process registry: user_id -> runner. The /replay endpoints own writes.
REPLAY_RUNNING: dict[str, "ReplayRunner"] = {}


class ReplayRunner:
    def __init__(
        self,
        *,
        session: ReplaySession,
        tick_seconds: float = 0.05,
        now=None,
    ) -> None:
        self.session = session
        self.engine = session.engine
        self.journal = self.engine.journal
        self._stop = asyncio.Event()
        self._tick = tick_seconds
        self._now = now or (lambda: datetime.now(UTC))
        self.journal.emit(
            "session_started",
            timestamp=session.sim_clock,
            trading_day=session.session_date,
            speed=session.speed,
            automation=self.engine.automation,
            reason="historic replay started",
        )

    # ---- controls -----------------------------------------------------------

    def play(self) -> None:
        if self.session.status in ("playing", "paused"):
            self.session.status = "playing"

    def pause(self) -> None:
        if self.session.status == "playing":
            self.session.status = "paused"

    def set_speed(self, speed: int) -> None:
        self.session.speed = speed

    def set_automation(self, enabled: bool) -> None:
        self.engine.automation = enabled

    def stop(self) -> None:
        if self.session.status not in ("completed",):
            self.session.status = "stopped"
        self._stop.set()

    # ---- pacing -------------------------------------------------------------

    def advance(self, real_seconds: float) -> None:
        """Advance the sim-clock by `real_seconds * speed` and deliver every bar
        whose boundary the clock has crossed, in order. No-op unless playing."""
        s = self.session
        if s.status != "playing":
            return
        s.sim_clock = s.sim_clock + timedelta(seconds=real_seconds * s.speed)
        while self.engine.has_next() and self.engine.next_bar_time() <= s.sim_clock:
            self.engine.step()
        if not self.engine.has_next():
            self._complete()

    def _complete(self) -> None:
        s = self.session
        if s.status == "completed":
            return
        s.status = "completed"
        s.sim_clock = self.engine.session_close_time()
        self.journal.emit(
            "replay_completed",
            timestamp=s.sim_clock,
            trading_day=s.session_date,
            trades=len(self.engine.trades),
            reason="reached session close",
        )

    # ---- production loop ----------------------------------------------------

    async def run(self) -> None:
        last = self._now()
        try:
            while not self._stop.is_set() and self.session.status != "completed":
                await asyncio.sleep(self._tick)
                now = self._now()
                dt = (now - last).total_seconds()
                last = now
                try:
                    self.advance(dt)
                except Exception as exc:  # noqa: BLE001 — keep pacing
                    _log.warning("replay advance error: %s", exc)
        finally:
            self._stop.set()
