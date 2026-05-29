import argparse
import csv as _csv
import json as _json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import uvicorn
import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

RUNS_DIR = Path("data/backtests")
CONFIG_PATH = Path("config/config.yaml")
PRESETS_DIR = Path("config/presets")
DATA_DIR = Path("data/raw")

# Downloaded yfinance CSVs follow `spy_5m_<START>_<END>.csv`. The bundled
# sample CSV (`spy_5m_sample.csv`) doesn't — it has no dates and is the
# fallback used by tests/the default config.
_DATASET_NAME_RE = re.compile(
    r"^spy_5m_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.csv$"
)


def _deep_merge(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in overrides.items():
        if isinstance(out.get(k), dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out

app = FastAPI(title="intraday-trade-spy static server", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def _http_exception_handler(_request: Request, exc: HTTPException):
    """H2 fix: unwrap dict detail payloads so the frontend sees
    {"error": ...} at the top level (not nested under "detail")."""
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(  # pragma: no cover  -- defensive: our endpoints always raise dict detail
        status_code=exc.status_code, content={"error": str(exc.detail)}
    )


_INT_COLS = {"row_seq", "quantity"}
_FLOAT_COLS = {
    "planned_entry", "stop_loss", "take_profit", "planned_risk_dollars",
    "actual_entry", "actual_exit", "realized_pnl", "realized_r",
    "vwap", "or_high", "or_low", "distance_from_vwap_pct", "prior_bar_close",
}


def _parse_journal_row(row: dict) -> dict:
    out: dict = {}
    for k, v in row.items():
        if v == "":
            out[k] = None
        elif k in _INT_COLS:
            out[k] = int(v) if v else None
        elif k in _FLOAT_COLS:
            out[k] = float(v)
        else:
            out[k] = v
    return out


@app.get("/api/runs")
def get_runs():
    out = []
    if not RUNS_DIR.exists():
        return out
    for d in RUNS_DIR.iterdir():
        if not d.is_dir():
            continue
        manifest_path = d / "run.yaml"
        if not manifest_path.exists():
            continue
        manifest = yaml.safe_load(manifest_path.read_text())
        out.append({
            "run_id": manifest.get("run_id", d.name),
            "started_at": manifest.get("run_started_at"),
            "summary": manifest.get("summary", {}),
        })
    out.sort(key=lambda r: r["started_at"], reverse=True)
    return out


@app.get("/api/runs/{run_id}/journal")
def get_journal(run_id: str):
    path = RUNS_DIR / run_id / "journal.csv"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "error": "run_not_found",
                "run_id": run_id,
                "missing": "journal.csv",
            },
        )
    with open(path, encoding="utf-8") as f:
        return [_parse_journal_row(r) for r in _csv.DictReader(f)]


@app.get("/api/runs/{run_id}/summary")
def get_summary(run_id: str):
    path = RUNS_DIR / run_id / "summary.json"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "error": "run_not_found",
                "run_id": run_id,
                "missing": "summary.json",
            },
        )
    return _json.loads(path.read_text())


@app.get("/api/runs/{run_id}/manifest")
def get_manifest(run_id: str):
    path = RUNS_DIR / run_id / "run.yaml"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "error": "run_not_found",
                "run_id": run_id,
                "missing": "run.yaml",
            },
        )
    return yaml.safe_load(path.read_text())


@app.get("/api/runs/{run_id}/bars")
def get_bars(run_id: str):
    manifest_path = RUNS_DIR / run_id / "run.yaml"
    if not manifest_path.exists():
        raise HTTPException(
            status_code=404,
            detail={"error": "run_not_found", "run_id": run_id},
        )
    manifest = yaml.safe_load(manifest_path.read_text())
    csv_path = Path(manifest["config_snapshot"]["data"]["csv_path"])
    if not csv_path.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "error": "source_data_missing",
                "run_id": run_id,
                "expected_path": str(csv_path),
            },
        )
    out = []
    with open(csv_path, encoding="utf-8") as f:
        for r in _csv.DictReader(f):
            out.append({
                "symbol": r["symbol"],
                "timestamp": r["timestamp"],
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": int(r["volume"]),
            })
    return out


@app.get("/api/config")
def get_config():
    if not CONFIG_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail={"error": "config_not_found", "path": str(CONFIG_PATH)},
        )
    return yaml.safe_load(CONFIG_PATH.read_text())


@app.get("/api/datasets")
def list_datasets():
    """List the SPY CSVs in `data/raw/`. Each entry carries the inferred
    start/end dates (parsed from the filename) and bar/session counts
    when a sidecar `<csv>.fetch.yaml` is present. Date-ranged datasets
    are sorted newest-end-first; the bundled sample CSV (no dates) goes
    last so the UI can still surface it for first-time users."""
    out: list[dict[str, Any]] = []
    if not DATA_DIR.exists():
        return out
    for csv in sorted(DATA_DIR.glob("*.csv")):
        entry: dict[str, Any] = {
            "path": str(csv),
            "name": csv.stem,
            "start": None,
            "end": None,
            "bar_count": None,
            "session_count": None,
        }
        m = _DATASET_NAME_RE.match(csv.name)
        if m:
            entry["start"], entry["end"] = m.group(1), m.group(2)
        sidecar = csv.parent / f"{csv.name}.fetch.yaml"
        if sidecar.exists():
            meta = yaml.safe_load(sidecar.read_text()) or {}
            entry["bar_count"] = meta.get("bar_count")
            entry["session_count"] = meta.get("session_count")
        out.append(entry)
    dated = [d for d in out if d["end"]]
    undated = [d for d in out if not d["end"]]
    dated.sort(key=lambda d: d["end"], reverse=True)
    return dated + undated


@app.get("/api/configs")
def list_configs():
    """List the default config + every YAML under config/presets/.
    Default is always first. Presets are sorted alphabetically."""
    out: list[dict[str, str]] = [
        {"name": "default", "path": str(CONFIG_PATH)},
    ]
    if PRESETS_DIR.exists():
        for p in sorted(PRESETS_DIR.glob("*.yaml")):
            out.append({"name": p.stem, "path": str(p)})
    return out


def _validate_config_path(raw: str) -> str:
    """Resolve `raw` against CONFIG_PATH.parent and ensure the result
    sits inside config/. Returns the safe path string; raises 400 on
    traversal or other invalid input."""
    config_root = CONFIG_PATH.parent.resolve()
    try:
        resolved = (Path.cwd() / raw).resolve()
    except (OSError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_config_path", "reason": str(e)},
        )
    if not resolved.is_relative_to(config_root):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_config_path", "reason": "outside_config_dir"},
        )
    return raw


@app.post("/api/backtests/run")
async def run_backtest(request: Request):
    """Invoke the backtest CLI as a subprocess. Optional JSON body
    {"overrides": {...}} deep-merges into config.yaml and runs against
    a temp file. Returns the newly-created run id."""
    overrides: dict[str, Any] = {}
    config_path: str | None = None
    try:
        body = await request.json()
        if isinstance(body, dict):
            overrides = body.get("overrides", {})
            config_path = body.get("config_path")
    except Exception:  # pragma: no cover  -- empty body / non-json
        pass

    tmp_path: Path | None = None
    if overrides:
        base = yaml.safe_load(CONFIG_PATH.read_text())
        merged = _deep_merge(base, overrides)
        fd = tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False, encoding="utf-8"
        )
        fd.write(yaml.safe_dump(merged))
        fd.close()
        tmp_path = Path(fd.name)
        config_arg = str(tmp_path)
    elif config_path:
        config_arg = _validate_config_path(config_path)
    else:
        config_arg = str(CONFIG_PATH)

    before = (
        {d.name for d in RUNS_DIR.iterdir() if d.is_dir()}
        if RUNS_DIR.exists()
        else set()
    )
    try:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "intraday_trade_spy.cli.run_backtest",
                "--config",
                config_arg,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "backtest_failed",
                "stderr": result.stderr[-500:],
            },
        )
    after = (
        {d.name for d in RUNS_DIR.iterdir() if d.is_dir()}
        if RUNS_DIR.exists()
        else set()
    )
    new_runs = after - before
    if not new_runs:
        raise HTTPException(
            status_code=500,
            detail={"error": "no_run_created"},
        )
    return {"run_id": max(new_runs)}


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: str):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists() or not run_dir.is_dir():
        raise HTTPException(
            status_code=404,
            detail={"error": "run_not_found", "run_id": run_id},
        )
    shutil.rmtree(run_dir)
    return {"deleted": run_id}


@app.delete("/api/runs")
def delete_all_runs():
    if not RUNS_DIR.exists():
        return {"deleted_count": 0}
    count = 0
    for d in RUNS_DIR.iterdir():
        if d.is_dir():
            shutil.rmtree(d)
            count += 1
    return {"deleted_count": count}


def main(argv: list[str] | None = None) -> int:  # pragma: no cover
    """Bootstrap the static server. Excluded from coverage per M5 (the
    argparse + uvicorn.run() path can't be unit-tested without actually
    starting a server)."""
    p = argparse.ArgumentParser(prog="intraday-trade-spy-server")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--host", default="0.0.0.0")
    args = p.parse_args(argv)
    uvicorn.run(app, host=args.host, port=args.port)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
