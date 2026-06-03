"""T066 — Principle II/V guard (Feature 011, FR-022).

The validation engine EVALUATES and REPORTS only: it must never enable live
trading or place real orders. v1 has no live broker at all; this test guards
against one being wired in through validation code, and pins the config gate.
"""

import pathlib

import intraday_trade_spy.api.validation_lifecycle as vlife
import intraday_trade_spy.validation as validation_pkg
from intraday_trade_spy.config import BrokerConfig


def _validation_sources() -> list[str]:
    pkg_dir = pathlib.Path(validation_pkg.__file__).parent
    files = list(pkg_dir.glob("*.py")) + [pathlib.Path(vlife.__file__)]
    return [f.read_text() for f in files]


def test_live_trading_disabled_by_default_in_config():
    # Constitution V: the gate is pinned False at the type level.
    assert BrokerConfig().live_auto_enabled is False
    assert BrokerConfig.model_fields["live_auto_enabled"].annotation.__args__ == (False,)


def test_validation_code_never_enables_live_or_places_orders():
    for src in _validation_sources():
        compact = src.replace(" ", "")
        assert "live_auto_enabled=True" not in compact
        lower = src.lower()
        # No live/real order-placement surface and no non-paper broker.
        assert "alpacabroker" not in lower
        assert "place_order" not in lower
        assert "submit_order" not in lower


def test_validation_only_uses_the_paper_simulator():
    # Any broker the validation engine constructs is the in-process PaperBroker.
    joined = "\n".join(_validation_sources())
    assert "PaperBroker" in joined
    # No import of a live/alpaca broker module.
    assert "from intraday_trade_spy.broker.alpaca" not in joined
