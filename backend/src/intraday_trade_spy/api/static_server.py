import argparse
import csv as _csv
import json as _json
from pathlib import Path

import uvicorn
import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

RUNS_DIR = Path("backend/data/backtests")

app = FastAPI(title="intraday-trade-spy static server", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def _http_exception_handler(_request: Request, exc: HTTPException):
    """H2 fix: unwrap dict detail payloads so the frontend sees
    {"error": ...} at the top level (not nested under "detail")."""
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
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
