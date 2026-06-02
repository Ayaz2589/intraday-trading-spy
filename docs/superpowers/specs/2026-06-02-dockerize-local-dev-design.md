# Dockerize the Local App (One-Command Dev Env) — Design

**Date**: 2026-06-02
**Status**: Approved — implementation via direct TDD-style execution off this doc
**Topic**: Add a Docker Compose dev stack so `docker compose up` runs the backend API + frontend with hot reload, against the existing remote Supabase, with no local Python/Node install required.

---

## 1. Goal / Non-goals

**Goal**: One command brings up the local app for development:
- Backend FastAPI on **:8001** with `--reload` (hot reload on source edits).
- Frontend Vite dev server on **:5173** with HMR.
- Both talk to the **existing remote Supabase** project via the current `.env` files.
- No need to install Python/venv or Node locally.

**Non-goals**:
- Production-parity local run (the prod `Dockerfile` already exists for that).
- Bundling local Supabase (`supabase start`) — the stack uses the remote project, matching today's `make dev`.
- Any change to the prod `Dockerfile`, `fly.toml`, or Vercel.
- Changing app behavior or `frontend/.env` / `backend/.env` contents.

## 2. Approach (chosen: A)

Single root `docker-compose.yml` with two services. The **prod `backend/Dockerfile` is left untouched**; the dev backend uses a separate `backend/Dockerfile.dev`. The frontend runs off the stock `node:20` image (no frontend Dockerfile) with source bind-mounted and `node_modules` in a named volume.

Rejected: (B) refactoring the prod Dockerfile into multi-stage `dev`/`prod` — edits a deploy-critical file for little gain; (C) a dedicated `frontend/Dockerfile.dev` — unnecessary file for a single-dev project.

## 3. Components / files

**New: `docker-compose.yml` (repo root)**
- Service **`backend`**:
  - `build: { context: ./backend, dockerfile: Dockerfile.dev }`
  - `env_file: ./backend/.env`
  - `ports: ["8001:8001"]`
  - `volumes`: `./backend/src:/app/src`, `./backend/config:/app/config`, `./backend/db:/app/db` (live source for reload)
  - `command: uvicorn intraday_trade_spy.api.app:app --host 0.0.0.0 --port 8001 --reload`
  - `environment`: commented `WATCHFILES_FORCE_POLLING=1` toggle (fallback if file events don't propagate)
- Service **`frontend`**:
  - `image: node:20-bookworm-slim`
  - `working_dir: /app`
  - `volumes`: `./frontend:/app` + named volume `frontend_node_modules:/app/node_modules`
  - `ports: ["5173:5173"]`
  - `command: sh -c "npm install && npm run dev -- --host 0.0.0.0"`
  - `environment`: commented `CHOKIDAR_USEPOLLING=true` toggle (HMR fallback)
- Top-level `volumes: { frontend_node_modules: {} }`

**New: `backend/Dockerfile.dev`**
```dockerfile
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml .
COPY src ./src
RUN pip install --upgrade pip && pip install -e ".[dev]" watchfiles
CMD ["uvicorn", "intraday_trade_spy.api.app:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
```
The `COPY src` satisfies the editable install at build; the compose bind-mount then overlays live host source. `watchfiles` is added explicitly because `uvicorn>=0.32` is installed without `[standard]`.

**Modify: `Makefile`** — add:
- `docker-up`: `docker compose up --build`
- `docker-down`: `docker compose down`
(Both `.PHONY`, with `## ` help text matching the existing help convention.)

**Modify: `.gitignore` / `.dockerignore`** — none required (`.env` already ignored; `backend/.dockerignore` already excludes `.venv`, caches; the dev build context only needs `pyproject.toml` + `src`).

## 4. Wiring rationale

- **Browser → backend** is unchanged: the browser runs on the host and calls `VITE_API_BASE_URL=http://localhost:8001` (already in `frontend/.env`) → the published `8001` port. No container DNS needed.
- **Backend → Supabase**: `env_file: ./backend/.env` (remote `SUPABASE_URL` + service-role key) — identical to `make api-dev`.
- **Secrets** stay in `.env` files (git-ignored); never baked into images or committed.
- **Hot reload**: Docker Desktop VirtioFS propagates fs events → `watchfiles` (backend) and Vite HMR (frontend) work over bind mounts. Polling env toggles included as commented fallbacks.

## 5. Verification (infra — TDD-exempt, like the prod Dockerfile/fly.toml)

1. `docker compose up --build` brings both services up healthy.
2. `curl localhost:8001/healthz` → `{"status":"ok","db":"ok"}`.
3. `http://localhost:5173` loads the sign-in page (HTTP 200).
4. Edit a backend source file → uvicorn reloads; edit a frontend file → Vite HMR updates.
5. `docker compose down` tears it down cleanly.

## 6. Decisions recorded

| Decision | Choice |
|---|---|
| Purpose | One-command hot-reload dev env |
| Supabase | Remote (existing `.env`) |
| Approach | A — root compose + `Dockerfile.dev`, frontend on `node:20` base |
| Prod Dockerfile / fly.toml | Untouched |
| Makefile targets | Add `docker-up` / `docker-down` |
| Reload | Add `watchfiles` in dev image; polling toggles as fallback |
