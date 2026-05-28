import argparse
from pathlib import Path

import uvicorn
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
