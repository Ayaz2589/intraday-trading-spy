import ast
from pathlib import Path

STRATEGY_DIR = Path(__file__).resolve().parents[1] / "src" / "intraday_trade_spy" / "strategy"
FORBIDDEN_PREFIXES = ("intraday_trade_spy.broker", "intraday_trade_spy.risk")


def _imports(file: Path) -> set[str]:
    tree = ast.parse(file.read_text())
    out: set[str] = set()
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
            assert not any(m.startswith(p) for p in FORBIDDEN_PREFIXES), (
                f"{f} imports forbidden module {m}"
            )
