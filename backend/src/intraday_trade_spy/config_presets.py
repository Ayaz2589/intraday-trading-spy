"""Built-in config presets (Feature 012).

Loads the YAML presets in ``backend/config/presets/*.yaml`` into
``{name, description, params}`` records so the operator can create a new named
config from a preset. The full preset YAML is a complete config; a config's
``params`` is the nested ``{risk, strategy, market}`` subset (matching what the
``configs.params`` JSONB stores and ``build_effective_config`` expects).

Presets are read-only templates — instantiating one copies its params into a
new, editable named config.
"""

from __future__ import annotations

from pathlib import Path

import yaml

PRESETS_DIR = Path(__file__).resolve().parents[2] / "config" / "presets"

# Keys of a full config YAML that belong in a per-user config's params.
_PARAM_KEYS = ("risk", "strategy", "market")


def _description(raw: str, name: str) -> str:
    """Pull a human description from the leading `# PRESET: <name> — <text>`
    comment; fall back to the name."""
    for line in raw.splitlines():
        s = line.strip()
        if s.startswith("# PRESET:"):
            text = s[len("# PRESET:"):].strip()
            # "aggressive — bigger risk ..." → keep the part after the dash if present
            if "—" in text:
                text = text.split("—", 1)[1].strip()
            elif "-" in text:
                text = text.split("-", 1)[1].strip()
            return text or name
    return name


def load_presets() -> list[dict]:
    """Return the built-in presets as ``[{name, description, params}]``, sorted
    by name. Skips the directory's README/non-config files."""
    if not PRESETS_DIR.is_dir():
        return []
    out: list[dict] = []
    for path in sorted(PRESETS_DIR.glob("*.yaml")):
        raw = path.read_text()
        doc = yaml.safe_load(raw) or {}
        params = {k: doc[k] for k in _PARAM_KEYS if k in doc}
        if "risk" not in params or "strategy" not in params:
            continue  # not a strategy-config preset
        out.append(
            {
                "name": path.stem,
                "description": _description(raw, path.stem),
                "params": params,
            }
        )
    return out
