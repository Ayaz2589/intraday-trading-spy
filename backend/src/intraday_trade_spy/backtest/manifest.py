import subprocess
from datetime import datetime
from pathlib import Path

import yaml

from intraday_trade_spy.config import Config
from intraday_trade_spy.data.fingerprint import fingerprint_csv
from intraday_trade_spy.models import BacktestRun, SummaryMetrics


def _code_version() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        return out.stdout.strip() or "unversioned"
    except Exception:
        return "unversioned"


def build_run(
    *,
    csv_path: Path,
    cfg: Config,
    summary: SummaryMetrics,
    started: datetime,
    ended: datetime,
) -> BacktestRun:
    fp = fingerprint_csv(csv_path)
    run_id = f"{started.strftime('%Y%m%d-%H%M%S')}-{fp.sha256[:8]}"
    return BacktestRun(
        run_id=run_id,
        run_started_at=started,
        run_ended_at=ended,
        code_version=_code_version(),
        config_snapshot=cfg.model_dump(mode="json"),
        data_fingerprint=fp,
        summary=summary,
    )


def write_run_yaml(run: BacktestRun, path: Path) -> None:
    payload = run.model_dump(mode="json")
    path.write_text(yaml.safe_dump(payload, sort_keys=True, default_flow_style=False))
