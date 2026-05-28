---
description: "Task list for Backtest Viewer UI (Feature 003)"
---

# Tasks: Backtest Viewer UI

**Input**: Design documents from `/specs/003-backtest-viewer-ui/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/*`, `quickstart.md`. Constitution v1.1.0 at
`.specify/memory/constitution.md`.

**Tests**: MANDATORY per constitution v1.1.0 principle IV (Test-First
Everywhere). EVERY implementation task targeting
`backend/src/intraday_trade_spy/api/**`, `frontend/src/components/**`,
`frontend/src/routes/**`, `frontend/src/api/**` (any non-exempt file
per research.md Decision 10) MUST be preceded by a failing-test task.

**Exempt files** (no preceding test required):
- `frontend/src/main.tsx` (≤5-line createRoot bootstrap)
- `frontend/src/lib/utils.ts` (1-line `cn()` shadcn helper)
- `frontend/src/components/ui/*` (shadcn copy-paste primitives)
- `frontend/test/setup.ts` (Vitest infrastructure)
- `frontend/vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`,
  `postcss.config.js`, `eslint.config.js`, `package.json`
- `frontend/index.html`
- `frontend/src/styles/globals.css`
- Makefile additions

**Organization**: Tasks are grouped by phase. Within Phases 3–7, tasks
also carry the user-story tag (`[US1]` … `[US5]`).

**Task IDs**: Continuous with Features 001+002 — this file starts at T121.

## Cross-feature prerequisite

This feature consumes the on-disk run artifacts produced by Feature
001 + the bar CSV files produced by Feature 002. Specifically:

1. **At least one backtest run** must exist under
   `backend/data/backtests/<run-id>/` (with `journal.csv`,
   `summary.json`, `run.yaml`) before integration tests run.
2. Run `make backtest` (or `make demo`) to populate a run if none
   exists.
3. Features 001 + 002 must be fully installed (the Python venv at
   `backend/.venv` must have `pip install -e ".[dev]"` completed).

## TDD micro-cycle convention

For each implementation task whose target is in-scope, the preceding
`Test:` task contains the failing test. The expected cycle:

1. Write the failing test
2. Run `pytest <node>` or `npm test -- <pattern>` and verify it fails
3. Write minimal implementation
4. Run the same command and verify it passes
5. Commit

---

## Phase 1: Setup

**Purpose**: Add backend dependencies, scaffold the frontend, install
shadcn/ui primitives, add Makefile targets. No production logic yet.

### Backend additions

- [X] T121 Modify `backend/pyproject.toml`:
  - Add `fastapi>=0.115` and `uvicorn>=0.32` to `dependencies`.
  - Add `httpx>=0.27` to `[project.optional-dependencies].dev`.
  - Add `intraday-trade-spy-server = "intraday_trade_spy.api.static_server:main"` under `[project.scripts]`.
  - **Add a coverage exclude section** (M5 fix for SC-002 reachability):
    ```toml
    [tool.coverage.run]
    branch = false
    omit = []

    [tool.coverage.report]
    exclude_lines = [
        "pragma: no cover",
        "if __name__ == .__main__.:",
    ]
    ```
  Then `pip install -e ".[dev]"` to register the deps + new console script.

- [X] T122 [P] Create `backend/src/intraday_trade_spy/api/__init__.py` — empty file (just marks the package).

### Frontend scaffold (TDD-exempt — all config/infrastructure)

- [X] T123 Create `frontend/package.json` with:
  ```json
  {
    "name": "intraday-trade-spy-frontend",
    "private": true,
    "version": "0.1.0",
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "tsc -b && vite build",
      "preview": "vite preview",
      "typecheck": "tsc --noEmit",
      "test": "vitest run",
      "test:watch": "vitest",
      "lint": "eslint ."
    },
    "dependencies": {
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "react-router": "^7.0.0",
      "lightweight-charts": "^5.0.0",
      "class-variance-authority": "^0.7.0",
      "clsx": "^2.1.0",
      "tailwind-merge": "^2.5.0",
      "lucide-react": "^0.460.0"
    },
    "devDependencies": {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@types/node": "^22.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      "@testing-library/react": "^16.0.0",
      "@testing-library/jest-dom": "^6.5.0",
      "@testing-library/user-event": "^14.5.0",
      "happy-dom": "^15.0.0",
      "vitest": "^2.1.0",
      "@vitest/coverage-v8": "^2.1.0",
      "typescript": "^5.6.0",
      "vite": "^6.0.0",
      "tailwindcss": "^4.0.0",
      "@tailwindcss/vite": "^4.0.0",
      "autoprefixer": "^10.4.0",
      "postcss": "^8.4.0",
      "eslint": "^9.0.0",
      "@typescript-eslint/eslint-plugin": "^8.0.0",
      "@typescript-eslint/parser": "^8.0.0",
      "eslint-plugin-react": "^7.37.0",
      "eslint-plugin-react-hooks": "^5.0.0",
      "globals": "^15.0.0"
    }
  }
  ```

- [X] T124 [P] Create `frontend/tsconfig.json` (project references config):
  ```json
  {
    "files": [],
    "references": [
      { "path": "./tsconfig.app.json" },
      { "path": "./tsconfig.node.json" }
    ],
    "compilerOptions": {
      "paths": { "@/*": ["./src/*"] }
    }
  }
  ```
  Plus `frontend/tsconfig.app.json` with `strict: true`, `target: ES2022`, `jsx: react-jsx`, `moduleResolution: bundler`, `paths: { "@/*": ["./src/*"] }`, includes `src` and `test`. Plus `frontend/tsconfig.node.json` for the Vite/Vitest config files.

- [X] T125 [P] Create `frontend/vite.config.ts`:
  ```ts
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";
  import tailwindcss from "@tailwindcss/vite";
  import path from "node:path";

  export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://localhost:8000",
      },
    },
    test: {
      environment: "happy-dom",
      globals: true,
      setupFiles: ["./test/setup.ts"],
      css: false,
    },
  });
  ```

- [X] T126 [P] Create `frontend/eslint.config.js` (flat config) — React + TS + hooks + tailwind-friendly. Reasonable default; ESLint 9 flat config style.

- [X] T127 [P] Create `frontend/postcss.config.js` (Tailwind v4 just needs the Vite plugin; postcss config may be minimal/empty).

- [X] T128 [P] Create `frontend/index.html`:
  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>intraday-trade-spy — Backtest Viewer</title>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/src/main.tsx"></script>
    </body>
  </html>
  ```

- [X] T129 [P] Create `frontend/src/main.tsx` (TDD-exempt — 5-line bootstrap):
  ```tsx
  import { createRoot } from "react-dom/client";
  import { App } from "./App";
  import "./styles/globals.css";

  createRoot(document.getElementById("root")!).render(<App />);
  ```

- [X] T130 [P] Create `frontend/src/styles/globals.css` (TDD-exempt — CSS only):
  ```css
  @import "tailwindcss";
  ```

- [X] T131 [P] Create `frontend/src/lib/utils.ts` (TDD-exempt — 1-line shadcn helper):
  ```ts
  import { clsx, type ClassValue } from "clsx";
  import { twMerge } from "tailwind-merge";

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
  }
  ```

- [X] T132 [P] Create `frontend/test/setup.ts` (TDD-exempt — Vitest infrastructure):
  ```ts
  import "@testing-library/jest-dom/vitest";
  ```

### shadcn/ui primitives

- [X] T133 Initialize shadcn/ui in `frontend/` and add the primitives we need (TDD-exempt — copy-pasted primitives). Run:
  ```bash
  cd frontend
  npx shadcn@latest init   # accept defaults; use TypeScript; use Tailwind
  npx shadcn@latest add card table badge tooltip tabs button popover
  ```
  These create `frontend/src/components/ui/{card,table,badge,tooltip,tabs,button,popover}.tsx`.

### Makefile + .gitignore

- [X] T134 Modify root `Makefile` — add four new targets:
  ```make
  ui-install: ## Install frontend dependencies
  	cd frontend && npm install

  ui-dev: ## Start the Vite dev server (http://localhost:5173)
  	cd frontend && npm run dev

  ui-build: ## Production build → frontend/dist/
  	cd frontend && npm run build

  ui-server: ## Start the FastAPI static server (http://localhost:8000)
  	cd backend && .venv/bin/intraday-trade-spy-server
  ```
  Add these targets to the `.PHONY` line and the `make help` listing as well.

- [X] T135 [P] Modify root `.gitignore` — append:
  ```
  frontend/node_modules/
  frontend/dist/
  frontend/.vite/
  frontend/coverage/
  ```

### Setup verification

- [X] T136 Run `make ui-install` from project root. Expect: `npm install` completes, `frontend/node_modules/` populated, no errors. Verify with `ls frontend/node_modules/react`.

**Checkpoint (Phase 1)**: `make ui-install` succeeds; `frontend/package.json` + tsconfig + vite + eslint configs exist; shadcn primitives copied; `make help` shows the new ui-* targets.

---

## Phase 2: Foundational

**Purpose**: Build the typed plumbing every later phase depends on —
the API server skeleton, the TypeScript types, and the HelpTooltip
content dictionary. **No user story work may begin until this phase
is complete.**

### Backend API server skeleton

- [X] T137 Test: in `backend/tests/test_static_server.py`, add:
  ```python
  from fastapi.testclient import TestClient

  def test_app_starts_with_cors_for_localhost_5173():
      from intraday_trade_spy.api.static_server import app
      client = TestClient(app)
      resp = client.options(
          "/api/runs",
          headers={
              "Origin": "http://localhost:5173",
              "Access-Control-Request-Method": "GET",
          },
      )
      assert resp.status_code in (200, 204)
      assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
  ```
  Run `pytest backend/tests/test_static_server.py -v` — expect failure (`ModuleNotFoundError`).

- [X] T138 Implement `backend/src/intraday_trade_spy/api/static_server.py` minimal skeleton. **Includes a custom HTTPException handler so 404 responses return `{"error": ...}` directly (not wrapped under `{"detail": {...}}`)** — this is the H2 fix from analyze:
  ```python
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
  async def _http_exception_handler(request: Request, exc: HTTPException):
      # If detail is a dict, return it verbatim (so the frontend sees
      # {"error": "...", ...} at the top level, not nested under "detail").
      if isinstance(exc.detail, dict):
          return JSONResponse(status_code=exc.status_code, content=exc.detail)
      return JSONResponse(
          status_code=exc.status_code, content={"error": str(exc.detail)}
      )

  def main(argv: list[str] | None = None) -> int:  # pragma: no cover
      p = argparse.ArgumentParser(prog="intraday-trade-spy-server")
      p.add_argument("--port", type=int, default=8000)
      p.add_argument("--host", default="0.0.0.0")
      args = p.parse_args(argv)
      uvicorn.run(app, host=args.host, port=args.port)
      return 0

  if __name__ == "__main__":  # pragma: no cover
      raise SystemExit(main())
  ```
  Run T137 — expect PASS. Commit.

- [X] T138b Test (M3 fix): in `backend/tests/test_static_server.py`, add a CLI smoke test:
  ```python
  import subprocess, sys

  def test_console_script_help_runs_cleanly():
      result = subprocess.run(
          [sys.executable, "-m", "intraday_trade_spy.api.static_server", "--help"],
          capture_output=True, text=True,
      )
      assert result.returncode == 0
      assert "--port" in result.stdout
  ```
  Run — expect PASS (argparse `--help` exits cleanly before uvicorn starts).

### Frontend TypeScript types

- [X] T139 Test: in `frontend/src/api/types.test.ts`, add a compile-time-only assertion test:
  ```ts
  import { expectTypeOf } from "vitest";
  import type {
    RunSummaryView,
    JournalRowView,
    BarView,
    RunManifestView,
    JournalFilter,
  } from "./types";

  test("types are exported and have the expected shape", () => {
    expectTypeOf<RunSummaryView["run_id"]>().toBeString();
    expectTypeOf<JournalRowView["status"]>().not.toBeNever();
    expectTypeOf<BarView["symbol"]>().toEqualTypeOf<"SPY">();
    expectTypeOf<RunManifestView["data_fingerprint"]["sha256"]>().toBeString();
    expectTypeOf<JournalFilter>().toMatchTypeOf<
      "all" | "executed" | "exited" | "rejected" | "lockout" | "force_flat"
    >();
  });
  ```
  Run `npm test -- types.test` — expect failure.

- [X] T140 Implement `frontend/src/api/types.ts` — paste the type definitions verbatim from `data-model.md` (the TypeScript section). Run T139 — expect PASS.

### HelpContent dictionary

- [X] T141 Test: in `frontend/src/components/help-content.test.ts`:
  ```ts
  import { HELP_CONTENT, type HelpContentKey } from "./help-content";

  describe("HELP_CONTENT", () => {
    it("has every HelpContentKey covered (14 concepts)", () => {
      const expected: HelpContentKey[] = [
        "vwap", "opening_range", "r_multiple", "profit_factor",
        "max_drawdown", "win_rate", "rejected_signal", "position_cap",
        "cooldown", "lockout", "force_flat_exit", "take_profit",
        "stop_loss", "risk_per_trade",
      ];
      for (const key of expected) {
        expect(HELP_CONTENT[key]).toBeDefined();
        expect(HELP_CONTENT[key].title.length).toBeGreaterThan(0);
        expect(HELP_CONTENT[key].description.length).toBeGreaterThan(20);
      }
      expect(Object.keys(HELP_CONTENT).length).toBe(14);
    });
  });
  ```
  Run — expect failure.

- [X] T142 Implement `frontend/src/components/help-content.ts` — paste verbatim from `data-model.md`. Run T141 — expect PASS. Commit.

**Checkpoint (Phase 2)**: `pytest backend/tests/test_static_server.py -v` green; `cd frontend && npm test` green; `cd frontend && npm run typecheck` clean.

---

## Phase 3: User Story 1 — Sidebar + summary + journal + rejection breakdown (Priority: P1) 🎯 MVP

**Goal**: An engineer can open `http://localhost:5173/`, see the
sidebar list of runs, click one, and see the run header + summary
card + journal table + rejection breakdown card all populated from
real data on disk. No chart yet.

**Independent Test**: With at least one backtest run on disk, run
`make ui-server &` and `make ui-dev`, then open the browser. Click any
run. Confirm all four sections render.

### Backend: GET /api/runs

- [X] T143 [US1] Test: in `backend/tests/test_static_server.py`, add:
  ```python
  def test_get_runs_returns_empty_array_when_no_runs(tmp_path, monkeypatch):
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      client = TestClient(app)
      resp = client.get("/api/runs")
      assert resp.status_code == 200
      assert resp.json() == []

  def test_get_runs_returns_runs_newest_first(tmp_path, monkeypatch):
      # Synthesize two run directories.
      for i, run_id in enumerate(["20260101-100000-aaaaaaaa", "20260102-100000-bbbbbbbb"]):
          d = tmp_path / run_id
          d.mkdir()
          (d / "run.yaml").write_text(f"run_id: {run_id}\nrun_started_at: '2026-01-0{i+1}T10:00:00+00:00'\nsummary:\n  total_trades: 0\n  wins: 0\n  losses: 0\n  win_rate: 0.0\n  average_win_r: 0.0\n  average_loss_r: 0.0\n  average_r: 0.0\n  total_r: 0.0\n  profit_factor: null\n  max_drawdown_r: 0.0\n  best_trade_r: null\n  worst_trade_r: null\n  longest_consecutive_loss_streak: 0\n  rejected_signal_count: 0\n  rejection_breakdown: {{}}\n")
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      client = TestClient(app)
      resp = client.get("/api/runs")
      assert resp.status_code == 200
      data = resp.json()
      assert len(data) == 2
      assert data[0]["run_id"] == "20260102-100000-bbbbbbbb"  # newer first
      assert data[1]["run_id"] == "20260101-100000-aaaaaaaa"
  ```
  Run — expect failure.

- [X] T144 [US1] Implement `GET /api/runs` in `backend/src/intraday_trade_spy/api/static_server.py`:
  ```python
  import yaml
  from datetime import datetime
  from fastapi import HTTPException

  @app.get("/api/runs")
  def get_runs():
      out = []
      runs_dir = RUNS_DIR
      if not runs_dir.exists():
          return out
      for d in runs_dir.iterdir():
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
  ```
  Run T143 — expect PASS. Commit.

### Backend: GET /api/runs/{run_id}/journal

- [X] T145 [US1] Test: in `backend/tests/test_static_server.py`:
  ```python
  def test_get_journal_404_when_run_missing(tmp_path, monkeypatch):
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      client = TestClient(app)
      resp = client.get("/api/runs/missing-id/journal")
      assert resp.status_code == 404
      # Custom exception handler in T138 unwraps the detail dict to the
      # top level (analyze finding H2). So resp.json()["error"] works
      # directly without going through ["detail"].
      assert resp.json()["error"] == "run_not_found"
      assert resp.json()["missing"] == "journal.csv"

  def test_get_journal_returns_rows(tmp_path, monkeypatch):
      d = tmp_path / "20260101-100000-aaaaaaaa"
      d.mkdir()
      (d / "journal.csv").write_text(
          "row_seq,timestamp,status,setup,direction,planned_entry,stop_loss,take_profit,quantity,planned_risk_dollars,actual_entry,actual_exit,exit_reason,realized_pnl,realized_r,vwap,or_high,or_low,distance_from_vwap_pct,prior_bar_close,reason,rejection_check,same_bar_tiebreak\n"
          "0,2026-01-01T09:30:00-05:00,emitted,vwap_pullback_long,long,525.10,524.59,526.12,,,,,,,,524.88,525.00,523.90,0.042,525.05,Close above prior bar high,,\n"
      )
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      client = TestClient(app)
      resp = client.get("/api/runs/20260101-100000-aaaaaaaa/journal")
      assert resp.status_code == 200
      rows = resp.json()
      assert len(rows) == 1
      assert rows[0]["row_seq"] == 0
      assert rows[0]["status"] == "emitted"
      assert rows[0]["planned_entry"] == 525.10
      assert rows[0]["quantity"] is None
  ```
  Run — expect failure.

- [X] T146 [US1] Implement `GET /api/runs/{run_id}/journal`:
  ```python
  import csv as _csv

  @app.get("/api/runs/{run_id}/journal")
  def get_journal(run_id: str):
      path = RUNS_DIR / run_id / "journal.csv"
      if not path.exists():
          raise HTTPException(status_code=404, detail={"error": "run_not_found", "run_id": run_id, "missing": "journal.csv"})
      rows = []
      with open(path, encoding="utf-8") as f:
          reader = _csv.DictReader(f)
          for r in reader:
              parsed = {}
              for k, v in r.items():
                  if v == "":
                      parsed[k] = None
                  elif k in ("row_seq", "quantity"):
                      parsed[k] = int(v) if v else None
                  elif k in ("planned_entry", "stop_loss", "take_profit", "planned_risk_dollars", "actual_entry", "actual_exit", "realized_pnl", "realized_r", "vwap", "or_high", "or_low", "distance_from_vwap_pct", "prior_bar_close"):
                      parsed[k] = float(v)
                  else:
                      parsed[k] = v
              rows.append(parsed)
      return rows
  ```
  Note: FastAPI's `HTTPException.detail` should serialize as the response body. If tests expect `resp.json()["error"]` directly (not nested under `detail`), use a custom exception handler or return `JSONResponse` directly. Adjust based on test expectations.
  Run T145 — expect PASS. Commit.

### Backend: GET /api/runs/{run_id}/summary

- [X] T147 [US1] Test: in `backend/tests/test_static_server.py`:
  ```python
  def test_get_summary_returns_json(tmp_path, monkeypatch):
      d = tmp_path / "abc"; d.mkdir()
      (d / "summary.json").write_text('{"total_trades": 4, "wins": 1, "losses": 2, "win_rate": 0.25, "total_r": 1.596, "average_r": 0.399, "max_drawdown_r": -2.0, "profit_factor": 1.0, "rejected_signal_count": 66, "rejection_breakdown": {"a": 1}, "best_trade_r": 2.0, "worst_trade_r": -1.0, "longest_consecutive_loss_streak": 2, "average_win_r": 2.0, "average_loss_r": -1.0}')
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      client = TestClient(app)
      resp = client.get("/api/runs/abc/summary")
      assert resp.status_code == 200
      assert resp.json()["total_trades"] == 4

  def test_get_summary_404(tmp_path, monkeypatch):
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      resp = TestClient(app).get("/api/runs/missing/summary")
      assert resp.status_code == 404
  ```
  Run — expect failure.

- [X] T148 [US1] Implement `GET /api/runs/{run_id}/summary`:
  ```python
  import json as _json

  @app.get("/api/runs/{run_id}/summary")
  def get_summary(run_id: str):
      path = RUNS_DIR / run_id / "summary.json"
      if not path.exists():
          raise HTTPException(status_code=404, detail={"error": "run_not_found", "run_id": run_id, "missing": "summary.json"})
      return _json.loads(path.read_text())
  ```
  Run T147 — expect PASS. Commit.

### Backend: GET /api/runs/{run_id}/manifest

- [X] T149 [US1] Test: in `backend/tests/test_static_server.py`:
  ```python
  def test_get_manifest_returns_yaml_as_json(tmp_path, monkeypatch):
      d = tmp_path / "abc"; d.mkdir()
      (d / "run.yaml").write_text("run_id: abc\nrun_started_at: '2026-01-01T10:00:00+00:00'\ncode_version: deadbeef\ndata_fingerprint:\n  sha256: aaaaaaaa\n  bar_count: 234\n  earliest_timestamp: '2026-01-01T09:30:00-05:00'\n  latest_timestamp: '2026-01-01T15:55:00-05:00'\n  session_count: 1\nsummary:\n  total_trades: 0\n  wins: 0\n  losses: 0\n  win_rate: 0\n  average_win_r: 0\n  average_loss_r: 0\n  average_r: 0\n  total_r: 0\n  profit_factor: null\n  max_drawdown_r: 0\n  best_trade_r: null\n  worst_trade_r: null\n  longest_consecutive_loss_streak: 0\n  rejected_signal_count: 0\n  rejection_breakdown: {}\nconfig_snapshot: {}\n")
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      resp = TestClient(app).get("/api/runs/abc/manifest")
      assert resp.status_code == 200
      assert resp.json()["data_fingerprint"]["sha256"] == "aaaaaaaa"

  def test_get_manifest_404(tmp_path, monkeypatch):
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      resp = TestClient(app).get("/api/runs/missing/manifest")
      assert resp.status_code == 404
  ```
  Run — expect failure.

- [X] T150 [US1] Implement `GET /api/runs/{run_id}/manifest`:
  ```python
  @app.get("/api/runs/{run_id}/manifest")
  def get_manifest(run_id: str):
      path = RUNS_DIR / run_id / "run.yaml"
      if not path.exists():
          raise HTTPException(status_code=404, detail={"error": "run_not_found", "run_id": run_id, "missing": "run.yaml"})
      return yaml.safe_load(path.read_text())
  ```
  Run T149 — expect PASS. Commit.

### Frontend: HelpTooltip component

- [X] T151 [P] [US1] Test: in `frontend/src/components/help-tooltip.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { HelpTooltip } from "./help-tooltip";

  describe("HelpTooltip", () => {
    it("renders a ? icon with data-help-key attribute", () => {
      render(<HelpTooltip helpKey="vwap" />);
      const icon = screen.getByRole("button");
      expect(icon).toHaveAttribute("data-help-key", "vwap");
    });

    it("opens popover with title + description on click", async () => {
      render(<HelpTooltip helpKey="vwap" />);
      await userEvent.click(screen.getByRole("button"));
      expect(await screen.findByText("VWAP")).toBeInTheDocument();
      expect(await screen.findByText(/Volume-weighted average price/)).toBeInTheDocument();
    });
  });
  ```
  Run `npm test help-tooltip` — expect failure.

- [X] T152 [US1] Implement `frontend/src/components/help-tooltip.tsx`:
  ```tsx
  import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
  import { Button } from "@/components/ui/button";
  import { HelpCircle } from "lucide-react";
  import { HELP_CONTENT, type HelpContentKey } from "./help-content";

  export function HelpTooltip({ helpKey }: { helpKey: HelpContentKey }) {
    const content = HELP_CONTENT[helpKey];
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-1 inline-flex"
            data-help-key={helpKey}
            aria-label={`Help: ${content.title}`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <h4 className="font-semibold mb-2">{content.title}</h4>
          <p className="text-sm text-muted-foreground">{content.description}</p>
        </PopoverContent>
      </Popover>
    );
  }
  ```
  Run T151 — expect PASS. Commit.

### Frontend: StatusBadge component

- [X] T153 [P] [US1] Test: in `frontend/src/components/status-badge.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { StatusBadge } from "./status-badge";

  test("renders status text", () => {
    render(<StatusBadge status="executed" />);
    expect(screen.getByText("executed")).toBeInTheDocument();
  });

  test("applies color class based on status", () => {
    const { rerender } = render(<StatusBadge status="executed" />);
    expect(screen.getByText("executed")).toHaveClass(/green|blue/);
    rerender(<StatusBadge status="rejected" />);
    expect(screen.getByText("rejected")).toHaveClass(/red|orange/);
  });
  ```
  Run — expect failure.

- [X] T154 [US1] Implement `frontend/src/components/status-badge.tsx`:
  ```tsx
  import { Badge } from "@/components/ui/badge";
  import { cn } from "@/lib/utils";
  import type { JournalRowView } from "@/api/types";

  const COLORS: Record<JournalRowView["status"], string> = {
    emitted: "bg-blue-500/15 text-blue-700",
    approved: "bg-blue-500/15 text-blue-700",
    rejected: "bg-red-500/15 text-red-700",
    executed: "bg-green-500/15 text-green-700",
    exited: "bg-emerald-500/15 text-emerald-700",
    force_flat: "bg-gray-500/15 text-gray-700",
    lockout: "bg-orange-500/15 text-orange-700",
  };

  export function StatusBadge({ status }: { status: JournalRowView["status"] }) {
    return <Badge className={cn(COLORS[status])}>{status}</Badge>;
  }
  ```
  Run T153 — expect PASS.

### Frontend: API client

- [X] T155 [P] [US1] Test: in `frontend/src/api/client.test.ts`:
  ```ts
  import { fetchRuns, fetchJournal, fetchSummary, fetchManifest } from "./client";

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  test("fetchRuns hits /api/runs", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response("[]"));
    const out = await fetchRuns();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/runs", expect.any(Object));
    expect(out).toEqual([]);
  });

  test("fetchJournal 404 maps to error result", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response("", { status: 404 }));
    await expect(fetchJournal("missing")).rejects.toThrow(/not_found/);
  });

  test("fetchRuns supports AbortController cancelation", async () => {
    const ctrl = new AbortController();
    (globalThis.fetch as any).mockImplementation(() => new Promise(() => {}));
    const p = fetchRuns({ signal: ctrl.signal });
    ctrl.abort();
    // depending on impl, this either rejects with AbortError or resolves never
    // assert at least that fetch was called with the signal
    expect((globalThis.fetch as any).mock.calls[0][1].signal).toBe(ctrl.signal);
  });
  ```
  Run — expect failure.

- [X] T156 [US1] Implement `frontend/src/api/client.ts`:
  ```ts
  import type { RunSummaryView, JournalRowView, BarView, RunManifestView, SummaryMetricsView } from "./types";

  type FetchOpts = { signal?: AbortSignal };

  async function get<T>(path: string, opts?: FetchOpts): Promise<T> {
    const res = await fetch(path, { signal: opts?.signal });
    if (res.status === 404) {
      const body = await res.json().catch(() => ({ error: "not_found" }));
      throw new Error(body?.detail?.error ?? body?.error ?? "not_found");
    }
    if (!res.ok) throw new Error(`http_${res.status}`);
    return res.json() as Promise<T>;
  }

  export const fetchRuns = (opts?: FetchOpts) => get<RunSummaryView[]>("/api/runs", opts);
  export const fetchJournal = (id: string, opts?: FetchOpts) => get<JournalRowView[]>(`/api/runs/${id}/journal`, opts);
  export const fetchSummary = (id: string, opts?: FetchOpts) => get<SummaryMetricsView>(`/api/runs/${id}/summary`, opts);
  export const fetchManifest = (id: string, opts?: FetchOpts) => get<RunManifestView>(`/api/runs/${id}/manifest`, opts);
  export const fetchBars = (id: string, opts?: FetchOpts) => get<BarView[]>(`/api/runs/${id}/bars`, opts);
  ```
  Run T155 — expect PASS. Commit.

### Frontend: RunsSidebar

- [X] T157 [P] [US1] Test: in `frontend/src/components/runs-sidebar.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { MemoryRouter } from "react-router";
  import { RunsSidebar } from "./runs-sidebar";

  const runs = [
    { run_id: "r1", started_at: "2026-01-02T10:00:00+00:00", summary: { total_trades: 1 } as any },
    { run_id: "r2", started_at: "2026-01-01T10:00:00+00:00", summary: { total_trades: 0 } as any },
  ];

  test("renders runs", () => {
    render(<MemoryRouter><RunsSidebar runs={runs} selectedRunId="r1" /></MemoryRouter>);
    expect(screen.getByText("r1")).toBeInTheDocument();
    expect(screen.getByText("r2")).toBeInTheDocument();
  });

  test("highlights selected run", () => {
    render(<MemoryRouter><RunsSidebar runs={runs} selectedRunId="r1" /></MemoryRouter>);
    expect(screen.getByText("r1").closest("[data-selected]")).toHaveAttribute("data-selected", "true");
  });
  ```
  Run — expect failure.

- [X] T158 [US1] Implement `frontend/src/components/runs-sidebar.tsx`:
  ```tsx
  import { Link } from "react-router";
  import type { RunSummaryView } from "@/api/types";
  import { cn } from "@/lib/utils";

  export function RunsSidebar({ runs, selectedRunId }: { runs: RunSummaryView[]; selectedRunId: string | null }) {
    if (runs.length === 0) {
      return (
        <aside className="w-64 border-r p-4">
          <h2 className="font-semibold mb-2">No runs yet</h2>
          <p className="text-sm text-muted-foreground mb-2">Run a backtest to populate this viewer.</p>
          <pre className="bg-muted p-2 rounded text-xs">make backtest</pre>
        </aside>
      );
    }
    return (
      <aside className="w-64 border-r overflow-y-auto">
        <h2 className="font-semibold p-4 border-b">Runs ({runs.length})</h2>
        <ul>
          {runs.map((r) => (
            <li key={r.run_id} data-selected={r.run_id === selectedRunId}
                className={cn("border-b", r.run_id === selectedRunId && "bg-accent")}>
              <Link to={`/runs/${r.run_id}`} className="block p-3 hover:bg-muted">
                <div className="font-mono text-xs">{r.run_id}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.started_at).toLocaleString()}</div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    );
  }
  ```
  Run T157 — expect PASS.

### Frontend: RunHeader

- [X] T159 [P] [US1] Test: in `frontend/src/components/run-header.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { RunHeader } from "./run-header";

  const manifest = {
    run_id: "20260528-220714-7697908e",
    run_started_at: "2026-05-28T22:07:14+00:00",
    run_ended_at: "2026-05-28T22:07:15+00:00",
    code_version: "deadbeef",
    config_snapshot: {},
    data_fingerprint: { sha256: "7697908eabcdef0123456789", bar_count: 234, earliest_timestamp: "x", latest_timestamp: "y", session_count: 3 },
    summary: {} as any,
  };

  test("renders run id, started_at, code_version, sha256[:8]", () => {
    render(<RunHeader manifest={manifest as any} />);
    expect(screen.getByText("20260528-220714-7697908e")).toBeInTheDocument();
    expect(screen.getByText(/deadbeef/)).toBeInTheDocument();
    expect(screen.getByText(/7697908e/)).toBeInTheDocument();
  });
  ```
  Run — expect failure.

- [X] T160 [US1] Implement `frontend/src/components/run-header.tsx`:
  ```tsx
  import type { RunManifestView } from "@/api/types";

  export function RunHeader({ manifest }: { manifest: RunManifestView }) {
    return (
      <header className="border-b p-4 flex flex-col gap-1">
        <h1 className="text-xl font-mono">{manifest.run_id}</h1>
        <div className="text-sm text-muted-foreground flex gap-4">
          <span>started {new Date(manifest.run_started_at).toLocaleString()}</span>
          <span>code {manifest.code_version}</span>
          <span>data {manifest.data_fingerprint.sha256.slice(0, 8)}</span>
        </div>
      </header>
    );
  }
  ```
  Run T159 — expect PASS.

### Frontend: SummaryMetricsCard

- [X] T161 [P] [US1] Test: in `frontend/src/components/summary-metrics-card.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { SummaryMetricsCard } from "./summary-metrics-card";

  const summary = {
    total_trades: 4, wins: 1, losses: 2, win_rate: 0.25,
    average_win_r: 2.0, average_loss_r: -1.0, average_r: 0.399, total_r: 1.596,
    profit_factor: 1.0, max_drawdown_r: -2.0, best_trade_r: 2.0,
    worst_trade_r: -1.0, longest_consecutive_loss_streak: 2,
    rejected_signal_count: 66, rejection_breakdown: {},
  };

  test("renders all 8 metrics", () => {
    render(<SummaryMetricsCard summary={summary as any} />);
    expect(screen.getByText("4")).toBeInTheDocument();    // total trades
    expect(screen.getByText("25.0%")).toBeInTheDocument(); // win rate
    expect(screen.getByText("+1.596")).toBeInTheDocument();// total R
  });

  test("renders HelpTooltips for each measure", () => {
    render(<SummaryMetricsCard summary={summary as any} />);
    expect(document.querySelector('[data-help-key="r_multiple"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="profit_factor"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="max_drawdown"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="win_rate"]')).toBeTruthy();
  });
  ```
  Run — expect failure.

- [X] T162 [US1] Implement `frontend/src/components/summary-metrics-card.tsx`. **M6 fix**: the "Daily DD" tile is removed — there is no separate daily_drawdown metric in the backend; rendering `max_drawdown_r` twice was misleading. 7 metrics now:
  ```tsx
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { HelpTooltip } from "./help-tooltip";
  import type { SummaryMetricsView } from "@/api/types";
  import type { HelpContentKey } from "./help-content";

  function Metric({ label, value, helpKey }: { label: string; value: string; helpKey: HelpContentKey }) {
    return (
      <div>
        <div className="text-xs text-muted-foreground flex items-center">
          {label}<HelpTooltip helpKey={helpKey} />
        </div>
        <div className="text-lg font-mono">{value}</div>
      </div>
    );
  }

  export function SummaryMetricsCard({ summary }: { summary: SummaryMetricsView }) {
    const pf = summary.profit_factor;
    return (
      <Card>
        <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-4 gap-4">
          <Metric label="Total Trades" value={String(summary.total_trades)} helpKey="risk_per_trade" />
          <Metric label="W/L" value={`${summary.wins} / ${summary.losses}`} helpKey="win_rate" />
          <Metric label="Win Rate" value={`${(summary.win_rate * 100).toFixed(1)}%`} helpKey="win_rate" />
          <Metric label="Average R" value={summary.average_r.toFixed(3)} helpKey="r_multiple" />
          <Metric label="Total R" value={(summary.total_r >= 0 ? "+" : "") + summary.total_r.toFixed(3)} helpKey="r_multiple" />
          <Metric label="Max Drawdown" value={`${summary.max_drawdown_r.toFixed(3)}R`} helpKey="max_drawdown" />
          <Metric label="Profit Factor" value={pf == null ? "—" : pf.toFixed(3)} helpKey="profit_factor" />
        </CardContent>
      </Card>
    );
  }
  ```
  Run T161 — expect PASS. (Update T161's tooltip expectation list: drop `data-help-key="daily_drawdown"` from the assertions.)

### Frontend: RejectionBreakdownCard

- [X] T163 [P] [US1] Test: in `frontend/src/components/rejection-breakdown-card.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { RejectionBreakdownCard } from "./rejection-breakdown-card";

  test("renders rejection reasons sorted by count desc", () => {
    const breakdown = { position_value_exceeds_cap: 100, no_new_trades_after: 5 };
    render(<RejectionBreakdownCard breakdown={breakdown} total={105} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("position_value_exceeds_cap");
    expect(items[1]).toHaveTextContent("no_new_trades_after");
  });

  test("renders HelpTooltip on heading", () => {
    render(<RejectionBreakdownCard breakdown={{}} total={0} />);
    expect(document.querySelector('[data-help-key="rejected_signal"]')).toBeTruthy();
  });
  ```
  Run — expect failure.

- [X] T164 [US1] Implement `frontend/src/components/rejection-breakdown-card.tsx`:
  ```tsx
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { HelpTooltip } from "./help-tooltip";

  const HELP_BY_REASON: Record<string, "position_cap" | "cooldown"> = {
    position_value_exceeds_cap: "position_cap",
    cooldown_active: "cooldown",
  };

  export function RejectionBreakdownCard({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
    const items = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center">Rejections ({total})<HelpTooltip helpKey="rejected_signal" /></CardTitle></CardHeader>
        <CardContent>
          <ul>
            {items.map(([reason, count]) => (
              <li key={reason} className="flex justify-between text-sm py-1">
                <span className="font-mono flex items-center">{reason}{HELP_BY_REASON[reason] && <HelpTooltip helpKey={HELP_BY_REASON[reason]} />}</span>
                <span>{count}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }
  ```
  Run T163 — expect PASS.

### Frontend: JournalTable

- [X] T165 [P] [US1] Test: in `frontend/src/components/journal-table.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { JournalTable } from "./journal-table";

  const rows = [
    { row_seq: 0, timestamp: "2026-01-01T09:30:00-05:00", status: "executed", setup: "vwap_pullback_long", direction: "long", planned_entry: 525.10, stop_loss: 524.59, take_profit: 526.12, quantity: 19, planned_risk_dollars: 9.69, actual_entry: 525.45, actual_exit: null, exit_reason: null, realized_pnl: null, realized_r: null, vwap: 524.88, or_high: 525.00, or_low: 523.90, distance_from_vwap_pct: 0.04, prior_bar_close: 525.05, reason: "x", rejection_check: null, same_bar_tiebreak: null },
  ];

  test("renders all rows", () => {
    render(<JournalTable rows={rows as any} />);
    expect(screen.getByText("525.10")).toBeInTheDocument();
  });

  test("renders StatusBadge per row", () => {
    render(<JournalTable rows={rows as any} />);
    expect(screen.getByText("executed")).toBeInTheDocument();
  });

  test("renders HelpTooltips on relevant column headers", () => {
    render(<JournalTable rows={rows as any} />);
    expect(document.querySelector('[data-help-key="take_profit"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="stop_loss"]')).toBeTruthy();
    expect(document.querySelector('[data-help-key="risk_per_trade"]')).toBeTruthy();
  });
  ```
  Run — expect failure.

- [X] T166 [US1] Implement `frontend/src/components/journal-table.tsx`:
  ```tsx
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { StatusBadge } from "./status-badge";
  import { HelpTooltip } from "./help-tooltip";
  import type { JournalRowView } from "@/api/types";

  function f(v: number | null, digits = 4): string {
    return v == null ? "—" : v.toFixed(digits);
  }

  export function JournalTable({ rows }: { rows: JournalRowView[] }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Setup</TableHead>
            <TableHead>Entry</TableHead>
            <TableHead>Stop<HelpTooltip helpKey="stop_loss" /></TableHead>
            <TableHead>Target<HelpTooltip helpKey="take_profit" /></TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Risk $<HelpTooltip helpKey="risk_per_trade" /></TableHead>
            <TableHead>Realized R</TableHead>
            <TableHead>Reason / Check</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.row_seq}>
              <TableCell className="font-mono text-xs">{r.timestamp.slice(11, 16)}</TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="font-mono text-xs">{r.setup ?? "—"}</TableCell>
              <TableCell className="font-mono">{f(r.planned_entry, 2)}</TableCell>
              <TableCell className="font-mono">{f(r.stop_loss, 2)}</TableCell>
              <TableCell className="font-mono">{f(r.take_profit, 2)}</TableCell>
              <TableCell className="font-mono">{r.quantity ?? "—"}</TableCell>
              <TableCell className="font-mono">{f(r.planned_risk_dollars, 2)}</TableCell>
              <TableCell className="font-mono">{f(r.realized_r, 3)}</TableCell>
              <TableCell className="text-xs">{r.rejection_check ?? r.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  ```
  Run T165 — expect PASS. Commit.

### Frontend: routes + App wiring

- [X] T167 [US1] Test: in `frontend/src/routes/root.test.tsx`:
  ```tsx
  import { render, screen, waitFor } from "@testing-library/react";
  import { MemoryRouter, Routes, Route } from "react-router";
  import { Root } from "./root";

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
  });

  test("redirects to /runs/{first} when runs exist", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response(JSON.stringify([
      { run_id: "r1", started_at: "2026-01-02T10:00:00+00:00", summary: {} },
    ])));
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/runs/:run_id" element={<div>VIEWER {window.location.pathname}</div>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/VIEWER/)).toBeInTheDocument());
  });

  test("shows empty state when no runs", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response("[]"));
    render(<MemoryRouter><Root /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/No backtest runs yet/i)).toBeInTheDocument());
  });
  ```
  Run — expect failure.

- [X] T168 [US1] Implement `frontend/src/routes/root.tsx`:
  ```tsx
  import { useEffect, useState } from "react";
  import { Navigate } from "react-router";
  import { fetchRuns } from "@/api/client";
  import type { RunSummaryView } from "@/api/types";

  export function Root() {
    const [runs, setRuns] = useState<RunSummaryView[] | null>(null);
    useEffect(() => {
      const ctrl = new AbortController();
      fetchRuns({ signal: ctrl.signal }).then(setRuns).catch(() => setRuns([]));
      return () => ctrl.abort();
    }, []);
    if (runs == null) return <div className="p-8">Loading…</div>;
    if (runs.length === 0) {
      return (
        <div className="p-8">
          <h1 className="text-xl font-semibold mb-2">No backtest runs yet</h1>
          <p className="mb-4 text-muted-foreground">Run a backtest to populate this viewer.</p>
          <pre className="bg-muted p-3 rounded inline-block">make backtest</pre>
        </div>
      );
    }
    return <Navigate to={`/runs/${runs[0].run_id}`} replace />;
  }
  ```
  Run T167 — expect PASS.

- [X] T169 [US1] Test: in `frontend/src/routes/run-viewer.test.tsx`:
  ```tsx
  import { render, screen, waitFor } from "@testing-library/react";
  import { MemoryRouter, Routes, Route } from "react-router";
  import { RunViewer } from "./run-viewer";

  const summary = { total_trades: 4, wins: 1, losses: 2, win_rate: 0.25, average_r: 0, total_r: 0, max_drawdown_r: 0, profit_factor: null, rejected_signal_count: 0, rejection_breakdown: {}, best_trade_r: null, worst_trade_r: null, longest_consecutive_loss_streak: 0, average_win_r: 0, average_loss_r: 0 };
  const manifest = { run_id: "r1", run_started_at: "2026-01-02T10:00:00+00:00", run_ended_at: "x", code_version: "abc", config_snapshot: {}, data_fingerprint: { sha256: "deadbeefcafebabe", bar_count: 0, earliest_timestamp: "x", latest_timestamp: "y", session_count: 1 }, summary };

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url: any) => {
      if (url.includes("/runs/r1/journal")) return Promise.resolve(new Response("[]"));
      if (url.includes("/runs/r1/summary")) return Promise.resolve(new Response(JSON.stringify(summary)));
      if (url.includes("/runs/r1/manifest")) return Promise.resolve(new Response(JSON.stringify(manifest)));
      if (url === "/api/runs") return Promise.resolve(new Response(JSON.stringify([{ run_id: "r1", started_at: "x", summary }])));
      return Promise.resolve(new Response("[]"));
    });
  });

  test("renders header + summary + journal + rejections", async () => {
    render(
      <MemoryRouter initialEntries={["/runs/r1"]}>
        <Routes><Route path="/runs/:run_id" element={<RunViewer />} /></Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("r1")).toBeInTheDocument());
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText(/Rejections/i)).toBeInTheDocument();
  });
  ```
  Run — expect failure.

- [X] T170 [US1] Implement `frontend/src/routes/run-viewer.tsx` with **per-section error tracking** (M1 fix — each fetch's outcome is tracked independently so a single 404 doesn't silence the whole page):
  ```tsx
  import { useEffect, useState } from "react";
  import { useParams } from "react-router";
  import { fetchRuns, fetchJournal, fetchSummary, fetchManifest } from "@/api/client";
  import { RunsSidebar } from "@/components/runs-sidebar";
  import { RunHeader } from "@/components/run-header";
  import { SummaryMetricsCard } from "@/components/summary-metrics-card";
  import { RejectionBreakdownCard } from "@/components/rejection-breakdown-card";
  import { JournalTable } from "@/components/journal-table";
  import type { JournalRowView, RunManifestView, RunSummaryView, SummaryMetricsView } from "@/api/types";

  type SectionState<T> = { loading: true } | { error: string } | { data: T };

  function Section<T>({ state, children }: { state: SectionState<T>; children: (data: T) => React.ReactNode }) {
    if ("loading" in state) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
    if ("error" in state) return <div className="text-sm text-red-700 p-4">Error: {state.error}</div>;
    return <>{children(state.data)}</>;
  }

  function loadSection<T>(fn: (signal: AbortSignal) => Promise<T>, setter: (s: SectionState<T>) => void, ctrl: AbortController) {
    fn(ctrl.signal)
      .then((data) => setter({ data }))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setter({ error: String(e.message || e) });
      });
  }

  export function RunViewer() {
    const { run_id } = useParams<{ run_id: string }>();
    const [runs, setRuns] = useState<RunSummaryView[]>([]);
    const [manifest, setManifest] = useState<SectionState<RunManifestView>>({ loading: true });
    const [summary, setSummary] = useState<SectionState<SummaryMetricsView>>({ loading: true });
    const [journal, setJournal] = useState<SectionState<JournalRowView[]>>({ loading: true });

    useEffect(() => {
      const ctrl = new AbortController();
      fetchRuns({ signal: ctrl.signal }).then(setRuns).catch(() => {});
      return () => ctrl.abort();
    }, []);

    useEffect(() => {
      if (!run_id) return;
      setManifest({ loading: true });
      setSummary({ loading: true });
      setJournal({ loading: true });
      const ctrl = new AbortController();
      loadSection((s) => fetchManifest(run_id, { signal: s }), setManifest, ctrl);
      loadSection((s) => fetchSummary(run_id, { signal: s }), setSummary, ctrl);
      loadSection((s) => fetchJournal(run_id, { signal: s }), setJournal, ctrl);
      return () => ctrl.abort();
    }, [run_id]);

    return (
      <div className="flex h-screen">
        <RunsSidebar runs={runs} selectedRunId={run_id ?? null} />
        <main className="flex-1 overflow-y-auto">
          <Section state={manifest}>{(m) => <RunHeader manifest={m} />}</Section>
          <div className="p-4 grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Section state={summary}>{(s) => <SummaryMetricsCard summary={s} />}</Section>
            </div>
            <Section state={summary}>{(s) => <RejectionBreakdownCard breakdown={s.rejection_breakdown} total={s.rejected_signal_count} />}</Section>
          </div>
          <div className="p-4">
            <Section state={journal}>{(j) => <JournalTable rows={j} />}</Section>
          </div>
        </main>
      </div>
    );
  }
  ```
  Update T169 test to add a case mocking `/journal` → 404 and assert that "Error: ..." text renders in that section while summary still shows. Run — expect PASS.

- [X] T171 [US1] Create `frontend/src/App.tsx` (TDD-EXEMPT — thin router shell):
  ```tsx
  import { BrowserRouter, Routes, Route } from "react-router";
  import { Root } from "./routes/root";
  import { RunViewer } from "./routes/run-viewer";

  export function App() {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/runs/:run_id" element={<RunViewer />} />
        </Routes>
      </BrowserRouter>
    );
  }
  ```

### Phase 3 verification

- [X] T172 [US1] Smoke test: `make ui-server &` (terminal A) + `make ui-dev` (terminal B). Open `http://localhost:5173/` in browser. Verify: sidebar populates with at least one run, clicking a run shows header + summary card + rejection breakdown + journal table.

**Checkpoint (Phase 3 — MVP)**: All Phase 3 tests green; `cd frontend && npm run typecheck` clean; `make ui-dev` smoke test shows the working page. **This is the demo-ready MVP.**

---

## Phase 4: User Story 2 — Candlestick chart with VWAP + OR overlay (Priority: P2)

**Goal**: Add a candlestick chart to the run-viewer that shows the
bars Feature 001's engine consumed, with VWAP line + OR bands.

**Independent Test**: Pick a run with bar data. Confirm the chart
renders with all overlays.

### Backend: GET /api/runs/{run_id}/bars

- [X] T173 [US2] Test: in `backend/tests/test_static_server.py`:
  ```python
  def test_get_bars_happy_path(tmp_path, monkeypatch):
      bars = tmp_path / "spy_bars.csv"
      bars.write_text("symbol,timestamp,open,high,low,close,volume\nSPY,2026-01-01T09:30:00-05:00,525.0,525.5,524.8,525.1,1000000\n")
      d = tmp_path / "abc"; d.mkdir()
      (d / "run.yaml").write_text(f"run_id: abc\nconfig_snapshot:\n  data:\n    csv_path: {bars}\n")
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      resp = TestClient(app).get("/api/runs/abc/bars")
      assert resp.status_code == 200
      data = resp.json()
      assert len(data) == 1
      assert data[0]["symbol"] == "SPY"
      assert data[0]["close"] == 525.1

  def test_get_bars_404_when_run_missing(tmp_path, monkeypatch):
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      resp = TestClient(app).get("/api/runs/missing/bars")
      assert resp.status_code == 404

  def test_get_bars_404_when_source_data_missing(tmp_path, monkeypatch):
      d = tmp_path / "abc"; d.mkdir()
      (d / "run.yaml").write_text("run_id: abc\nconfig_snapshot:\n  data:\n    csv_path: /nope/missing.csv\n")
      monkeypatch.setattr("intraday_trade_spy.api.static_server.RUNS_DIR", tmp_path)
      from intraday_trade_spy.api.static_server import app
      resp = TestClient(app).get("/api/runs/abc/bars")
      assert resp.status_code == 404
      assert resp.json()["error"] == "source_data_missing"
      assert "expected_path" in resp.json()
  ```
  Run — expect failure.

- [X] T174 [US2] Implement `GET /api/runs/{run_id}/bars` in static_server.py:
  ```python
  @app.get("/api/runs/{run_id}/bars")
  def get_bars(run_id: str):
      manifest_path = RUNS_DIR / run_id / "run.yaml"
      if not manifest_path.exists():
          raise HTTPException(status_code=404, detail={"error": "run_not_found", "run_id": run_id})
      manifest = yaml.safe_load(manifest_path.read_text())
      csv_path = Path(manifest["config_snapshot"]["data"]["csv_path"])
      if not csv_path.exists():
          raise HTTPException(status_code=404, detail={"error": "source_data_missing", "run_id": run_id, "expected_path": str(csv_path)})
      out = []
      with open(csv_path, encoding="utf-8") as f:
          for r in _csv.DictReader(f):
              out.append({
                  "symbol": r["symbol"],
                  "timestamp": r["timestamp"],
                  "open": float(r["open"]), "high": float(r["high"]),
                  "low": float(r["low"]), "close": float(r["close"]),
                  "volume": int(r["volume"]),
              })
      return out
  ```
  Run T173 — expect PASS. Commit.

### Frontend: PriceChart

- [X] T175 [P] [US2] Test: in `frontend/src/components/price-chart.test.tsx`:
  ```tsx
  import { render } from "@testing-library/react";
  import { PriceChart } from "./price-chart";

  const bars = [
    { symbol: "SPY", timestamp: "2026-01-01T09:30:00-05:00", open: 525, high: 525.5, low: 524.8, close: 525.1, volume: 1000 },
  ];

  test("renders without crashing on bars", () => {
    const { container } = render(<PriceChart bars={bars as any} vwap={[{ time: "2026-01-01T09:30:00-05:00", value: 525.05 }]} or={null} markers={[]} />);
    expect(container.querySelector("[data-chart-root]")).toBeTruthy();
  });

  test("HelpTooltips for vwap + opening_range render in legend", () => {
    const { container } = render(<PriceChart bars={bars as any} vwap={[]} or={null} markers={[]} />);
    expect(container.querySelector('[data-help-key="vwap"]')).toBeTruthy();
    expect(container.querySelector('[data-help-key="opening_range"]')).toBeTruthy();
  });
  ```
  Run — expect failure.

- [X] T176 [US2] Implement `frontend/src/components/price-chart.tsx`. **lightweight-charts v5 expects timestamps as `UTCTimestamp` (Unix seconds), not ISO 8601 strings — M7 fix**:
  ```tsx
  import { useEffect, useRef } from "react";
  import {
    createChart,
    CandlestickSeries,
    LineSeries,
    type UTCTimestamp,
  } from "lightweight-charts";
  import { HelpTooltip } from "./help-tooltip";
  import type { BarView } from "@/api/types";

  const toUtc = (iso: string): UTCTimestamp =>
    Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

  export function PriceChart({ bars, vwap, or, markers }: {
    bars: BarView[];
    vwap: { time: string; value: number }[];
    or: { high: number; low: number; from: string; to: string } | null;
    markers: { time: string; position: "aboveBar" | "belowBar"; color: string; shape: "arrowUp" | "arrowDown" | "circle"; text: string }[];
  }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!ref.current) return;
      const chart = createChart(ref.current, { height: 400 });
      const candles = chart.addSeries(CandlestickSeries);
      candles.setData(bars.map((b) => ({
        time: toUtc(b.timestamp),
        open: b.open, high: b.high, low: b.low, close: b.close,
      })));
      if (vwap.length) {
        const line = chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 1 });
        line.setData(vwap.map((p) => ({ time: toUtc(p.time), value: p.value })));
      }
      if (or) {
        candles.createPriceLine({ price: or.high, color: "#22c55e", lineStyle: 2, title: "OR high" });
        candles.createPriceLine({ price: or.low, color: "#ef4444", lineStyle: 2, title: "OR low" });
      }
      if (markers.length) {
        candles.setMarkers(markers.map((m) => ({ ...m, time: toUtc(m.time) })));
      }
      return () => chart.remove();
    }, [bars, vwap, or, markers]);

    return (
      <div className="border rounded">
        <div className="flex gap-4 p-2 text-xs">
          <span className="flex items-center"><span className="w-3 h-0.5 bg-blue-500 mr-1" />VWAP<HelpTooltip helpKey="vwap" /></span>
          <span className="flex items-center"><span className="w-3 h-0.5 bg-green-500 mr-1" />OR high / low<HelpTooltip helpKey="opening_range" /></span>
        </div>
        <div ref={ref} data-chart-root />
      </div>
    );
  }
  ```
  Run T175 — expect PASS. The Vitest test (T175) asserts the container exists and doesn't throw; lightweight-charts renders to canvas in happy-dom and won't crash on valid input.

### Frontend: SessionPicker

- [X] T177 [P] [US2] Test: in `frontend/src/components/session-picker.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { SessionPicker } from "./session-picker";

  test("renders all sessions and fires callback on select", async () => {
    const onChange = vi.fn();
    render(<SessionPicker sessions={["2026-05-26", "2026-05-27"]} selected="2026-05-26" onChange={onChange} />);
    await userEvent.click(screen.getByText("2026-05-27"));
    expect(onChange).toHaveBeenCalledWith("2026-05-27");
  });
  ```
  Run — expect failure.

- [X] T178 [US2] Implement `frontend/src/components/session-picker.tsx`:
  ```tsx
  import { Button } from "@/components/ui/button";

  export function SessionPicker({ sessions, selected, onChange }: {
    sessions: string[];
    selected: string;
    onChange: (session: string) => void;
  }) {
    return (
      <div className="flex gap-1">
        {sessions.map((s) => (
          <Button key={s} size="sm" variant={s === selected ? "default" : "outline"} onClick={() => onChange(s)}>
            {s}
          </Button>
        ))}
      </div>
    );
  }
  ```
  Run T177 — expect PASS.

### Integration

- [X] T179 [US2] Update `run-viewer.tsx` to fetch bars via `fetchBars`, compute VWAP from journal (or fetch directly), group bars by session, render `<SessionPicker>` + `<PriceChart>` between the header and journal. Use the same `SectionState` pattern from T170 so a `source_data_missing` 404 renders "Chart: source data missing" inline instead of breaking the page (M2 fix). Update its test to:
  1. Assert the chart is present on the happy path.
  2. Mock `/bars` → 404 with `error: "source_data_missing"` and assert the chart slot renders the "Source data missing" message while summary + journal still render normally.

**Checkpoint (Phase 4)**: Browser smoke test — pick a run with bar data. Chart renders. Switch sessions if multi-session. VWAP + OR bands visible.

---

## Phase 5: User Story 3 — Trade markers on the chart (Priority: P3)

**Goal**: Overlay entry/exit markers on the chart from journal events.

- [X] T180 [US3] Test: in `frontend/src/components/price-chart.test.tsx`, add:
  ```tsx
  test("renders markers passed in", () => {
    const bars = [{ symbol:"SPY",timestamp:"2026-01-01T09:30:00-05:00",open:525,high:526,low:524,close:525.5,volume:1000 }];
    const markers = [
      { time: "2026-01-01T09:30:00-05:00", position: "belowBar", color: "#10b981", shape: "arrowUp", text: "Entry @ 525.45" }
    ];
    const { container } = render(<PriceChart bars={bars as any} vwap={[]} or={null} markers={markers} />);
    // lightweight-charts renders markers to canvas; we assert it didn't crash
    expect(container.querySelector("[data-chart-root]")).toBeTruthy();
  });
  ```
  Run — expect PASS if the PriceChart impl from T176 already accepts markers; otherwise update T176 to accept the markers prop.

- [X] T181 [US3] In `run-viewer.tsx`, build the markers array from journal:
  - For each `executed` row → marker at `row.timestamp` with arrowUp + entry label.
  - For each `exited` / `force_flat` row → marker with arrowDown + color by `exit_reason` (target=green, stop=red, force_flat=gray).
  - (Optional) For each `rejected` row → small × marker when toggle is on.
- [X] T182 [US3] Test: hover an exit marker shows realized R + dollar pnl in chart tooltip (lightweight-charts has a built-in crosshair tooltip; we surface marker text). Add a test that the marker text contains both values.
- [X] T183 [US3] Test + impl the rejection-marker toggle: add a `Switch` button next to the chart legend; toggling it adds/removes rejection markers from the markers array.

**Checkpoint (Phase 5)**: Browser smoke test — pick a run with executed trades (`make demo` if needed). See entry/exit markers; hover shows R + pnl. Toggle rejection markers.

---

## Phase 6: User Story 4 — HelpTooltip contract enforcement (Priority: P4)

**Goal**: Automated test asserts every concept in HELP_CONTENT has a paired rendered HelpTooltip on the viewer page.

- [X] T184 [US4] Test: in `frontend/src/routes/run-viewer.test.tsx`, add the contract test:
  ```tsx
  import { HELP_CONTENT } from "@/components/help-content";

  test("every HELP_CONTENT key has a rendered HelpTooltip on the page", async () => {
    // (Setup mocks for runs/manifest/summary/journal/bars including all relevant statuses)
    render(<MemoryRouter initialEntries={["/runs/r1"]}><Routes><Route path="/runs/:run_id" element={<RunViewer />} /></Routes></MemoryRouter>);
    await waitFor(() => screen.getByText("r1"));
    for (const key of Object.keys(HELP_CONTENT)) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy();
    }
  });
  ```
  If this fails for a key, the failing key tells you which component is missing its HelpTooltip. Fix that component.

- [X] T185 [US4] Type-only test: in `frontend/src/components/help-content.test.ts`, add:
  ```ts
  import { HELP_CONTENT, type HelpContentKey } from "./help-content";

  test("HELP_CONTENT covers every HelpContentKey (TypeScript-enforced via Record)", () => {
    const keys = Object.keys(HELP_CONTENT) as HelpContentKey[];
    expect(keys).toContain("vwap");  // sanity
    expect(keys.length).toBe(14);    // 14 concepts (daily_drawdown removed per M6)
  });
  ```
  Run — expect PASS (TypeScript already enforces exhaustiveness at compile time; this is the runtime sanity check).

- [X] T186 [US4] If T184 fails, walk the failing keys and add HelpTooltips to the missing components. Re-run until green.

**Checkpoint (Phase 6)**: Contract test green. Every concept in the dictionary has a paired tooltip.

---

## Phase 7: User Story 5 — Status filter (Priority: P5)

**Goal**: Filter the journal (and chart markers) by status.

- [X] T187 [US5] Test: in `frontend/src/components/journal-table.test.tsx`, add filter test:
  ```tsx
  test("filter chips filter rows", async () => {
    const rows = [
      { row_seq: 0, status: "executed", /* ... */ },
      { row_seq: 1, status: "rejected", /* ... */ },
    ];
    render(<JournalTable rows={rows as any} filter="executed" onFilterChange={() => {}} />);
    expect(screen.queryByText(/rejected/)).toBeNull();
  });
  ```
  Run — expect failure.

- [X] T188 [US5] Update `journal-table.tsx` to accept `filter` and `onFilterChange` props; render filter chips above the table; filter rows by `r.status === filter` (or show all when filter is `"all"`).

- [X] T189 [US5] Test: in `frontend/src/routes/run-viewer.test.tsx`, add a test that selecting a filter propagates to the markers array passed to PriceChart. (Simplest: mock fetch + click chip + assert that the chart receives a filtered markers array — easier via spying on PriceChart props.)

- [X] T190 [US5] In `run-viewer.tsx`, lift filter state into the route; pass it to both `<JournalTable>` and (via filtered markers) `<PriceChart>`.

**Checkpoint (Phase 7)**: Browser smoke test — click each filter chip, see the journal and chart markers update.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T191 [P] Run `cd backend && .venv/bin/pytest --cov=intraday_trade_spy.api --cov-report=term-missing tests/test_static_server.py`. Verify 100% coverage on `api/static_server.py`.

- [ ] T192 [P] Run `cd frontend && npm test -- --coverage`. Verify component coverage ≥90%.

- [ ] T193 [P] Run `cd backend && .venv/bin/ruff check src tests`. Fix any findings.

- [ ] T194 [P] Run `cd frontend && npm run lint && npm run typecheck`. Fix any findings.

- [ ] T194b [P] **M4 fix**: Run `cd frontend && npm run build` and verify `frontend/dist/index.html` exists plus the build emits no errors. This catches misconfigured Vite + TypeScript build settings that the dev server wouldn't catch.

- [ ] T195 Run the full quickstart end-to-end (Phase 1 install → Phase 7 polish):
  ```bash
  make ui-install
  make ui-server &
  make ui-dev
  # Open http://localhost:5173/ in browser, verify:
  # - Sidebar shows runs newest first
  # - Click a run, see header / summary / rejections / journal
  # - Chart renders with VWAP + OR
  # - Trade markers visible on executed runs
  # - HelpTooltips open on hover/click
  # - Filter chips work
  ```

- [ ] T196 [P] Update root `README.md` to add Feature 003 status (implemented), the `make ui-*` targets, and a note that the UI lives at http://localhost:5173/.

- [ ] T197 [P] Update `backend/README.md` to include the `make ui-server` workflow.

- [ ] T198 Commit final polish + cleanup.

**Checkpoint (Phase 8)**: Coverage met, lints clean, quickstart confirmed end-to-end.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no upstream; can start immediately.
- **Phase 2 (Foundational)** — depends on Phase 1; blocks every user story.
- **Phase 3 (US1)** — depends on Phase 2. Once green, this is the demo-ready MVP (sidebar + journal + summary visible in browser).
- **Phase 4 (US2)** — depends on Phase 3 (chart slots into the existing run-viewer layout). Independent of Phases 5-7.
- **Phase 5 (US3)** — depends on Phase 4 (markers extend the PriceChart).
- **Phase 6 (US4)** — depends on Phases 3-5 (every component that owns a HelpTooltip must exist).
- **Phase 7 (US5)** — depends on Phase 3 (journal table) and Phase 4 (chart markers); independent of 5+6.
- **Phase 8 (Polish)** — depends on every user-story phase.

### Cross-feature

- Feature 001 + Feature 002 implementations must exist for the static server to have data to serve.
- At least one backtest run must exist under `backend/data/backtests/` for integration smoke tests to pass.

---

## Parallel Opportunities

### Phase 1 parallel groups

```bash
# After T121 (pyproject) and T123 (package.json) exist:
Task: "T122 backend api/__init__.py"
Task: "T124 tsconfig*"
Task: "T125 vite.config.ts"
Task: "T126 eslint.config.js"
Task: "T127 postcss.config.js"
Task: "T128 index.html"
Task: "T129 main.tsx"
Task: "T130 styles/globals.css"
Task: "T131 lib/utils.ts"
Task: "T132 test/setup.ts"
```

### Phase 3 parallel groups (component tests)

```bash
# After T137-T142 (foundational types + dictionary), test files for
# DIFFERENT components can be authored in parallel:
Task: "T151 [US1] HelpTooltip test"
Task: "T153 [US1] StatusBadge test"
Task: "T155 [US1] api/client test"
Task: "T157 [US1] RunsSidebar test"
Task: "T159 [US1] RunHeader test"
Task: "T161 [US1] SummaryMetricsCard test"
Task: "T163 [US1] RejectionBreakdownCard test"
Task: "T165 [US1] JournalTable test"
```

After each test exists, its implementation task can run independently
of the other components.

### Phase 8 parallel groups

```bash
Task: "T191 backend coverage"
Task: "T192 frontend coverage"
Task: "T193 ruff"
Task: "T194 ESLint + typecheck"
Task: "T196 root README"
Task: "T197 backend README"
```

---

## Implementation Strategy

### MVP first (Phases 1+2+3 = US1 only)

1. Phase 1 Setup (T121–T136): scaffold the frontend + backend additions.
2. Phase 2 Foundational (T137–T142): API server skeleton + TS types + HELP_CONTENT dictionary.
3. Phase 3 User Story 1 (T143–T172): 4 backend endpoints + 8 frontend components + 2 routes. End: clicking a run shows header/summary/rejections/journal in the browser.
4. **STOP and VALIDATE**: open the browser, click runs, confirm the page works. **MVP shipped.**

### Incremental delivery

1. After MVP: Phase 4 (US2) — add the candlestick chart + VWAP + OR.
2. Then Phase 5 (US3) — add trade markers + tooltips.
3. Then Phase 6 (US4) — enforce the HelpTooltip contract test.
4. Then Phase 7 (US5) — status filter on journal + markers.
5. Then Phase 8 — coverage, lints, READMEs, quickstart timing.

### Parallel team strategy

This feature is solo-developable, but two developers could split as:
- Developer A: backend endpoints (T143–T150, T173–T174).
- Developer B: frontend components (T151–T172, T175–T179).
They converge at T172 (Phase 3 smoke test) and again at T179 (chart integration).

---

## Notes

- Every implementation task whose target is under
  `backend/src/intraday_trade_spy/api/**`, `frontend/src/components/**`
  (excluding `ui/*`), `frontend/src/routes/**`, or
  `frontend/src/api/**` has a preceding `Test:` task — constitution
  v1.1.0 principle IV.
- TDD-exempt tasks are explicitly flagged (T129, T130, T131, T132,
  T133, T171, plus config/Makefile additions).
- Each task names exact file paths — no placeholders.
- Code skeletons inline in both failing-test tasks (showing the
  expected component API) and implementation tasks (showing the
  minimal surface area needed to make the test pass).
- Commit after each TDD micro-cycle or each Checkpoint.
- If any task can't be completed because a file outside the project
  structure tree (plan.md) needs to be created, flag it as a
  deviation and update plan.md before proceeding.
