# Dockerize Local Dev — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docker compose up` runs the backend API (:8001, hot reload) + frontend Vite dev server (:5173, HMR) against the remote Supabase, with no local Python/Node install.

**Architecture:** Root `docker-compose.yml` with two services — `backend` built from a new dev-only `backend/Dockerfile.dev`, and `frontend` on the stock `node:20` image. Source is bind-mounted for hot reload; `node_modules` lives in a named volume. The prod `backend/Dockerfile`, `fly.toml`, and Vercel are untouched.

**Tech Stack:** Docker Compose v2, Python 3.11 + uvicorn + watchfiles, Node 20 + Vite.

**Design:** [docs/superpowers/specs/2026-06-02-dockerize-local-dev-design.md](../specs/2026-06-02-dockerize-local-dev-design.md)

**Conventions:** Run commands from repo root. Docker 27 → use `docker compose` (v2, space). Infra files are TDD-exempt (same as the existing prod `Dockerfile`/`fly.toml`); verification is via build + smoke checks. Requires `backend/.env` and `frontend/.env` to exist (they do).

---

### Task 1: Backend dev image

**Files:**
- Create: `backend/Dockerfile.dev`

- [ ] **Step 1: Create `backend/Dockerfile.dev`**

```dockerfile
# Local-dev image for the FastAPI backend — hot reload via bind-mounted source.
# Production uses ./Dockerfile (deployed to Fly); this file is dev-only and is
# referenced by ../docker-compose.yml. watchfiles is added explicitly because
# the project pins plain `uvicorn` (no [standard] extra), which --reload needs.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Editable install needs the package source present at build time; the compose
# bind-mount then overlays /app/src with live host source for hot reload.
COPY pyproject.toml /app/
COPY src /app/src

RUN pip install --upgrade pip && pip install -e ".[dev]" watchfiles

EXPOSE 8001

CMD ["uvicorn", "intraday_trade_spy.api.app:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
```

- [ ] **Step 2: Verify it builds**

Run: `docker build -f backend/Dockerfile.dev -t itspy-backend-dev ./backend`
Expected: builds successfully; final line `naming to docker.io/library/itspy-backend-dev` (or `Successfully tagged`).

- [ ] **Step 3: Verify watchfiles + app import inside the image**

Run: `docker run --rm itspy-backend-dev python -c "import watchfiles, intraday_trade_spy.api.app as a; print('ok', len(a.app.routes))"`
Expected: `ok 26`

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile.dev
git commit -m "feat(docker): backend dev image (uvicorn --reload + watchfiles)"
```

---

### Task 2: Compose stack

**Files:**
- Create: `docker-compose.yml` (repo root)

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
# Local development stack. One command — `docker compose up --build` — runs the
# backend API (:8001, hot reload) and the frontend Vite dev server (:5173, HMR),
# both talking to the remote Supabase configured in backend/.env + frontend/.env.
#
# Production is NOT built from this file: the backend ships via backend/Dockerfile
# + fly.toml, and the frontend deploys to Vercel.
#
# The browser runs on the host and calls VITE_API_BASE_URL=http://localhost:8001
# (in frontend/.env) → the published backend port, so no container DNS is needed.

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    env_file:
      - ./backend/.env
    environment:
      # Uncomment if --reload misses edits (no native fs events through the mount):
      # WATCHFILES_FORCE_POLLING: "1"
      PYTHONUNBUFFERED: "1"
    ports:
      - "8001:8001"
    volumes:
      - ./backend/src:/app/src
      - ./backend/config:/app/config
      - ./backend/db:/app/db

  frontend:
    image: node:20-bookworm-slim
    working_dir: /app
    depends_on:
      - backend
    environment:
      # Uncomment if Vite HMR misses edits:
      # CHOKIDAR_USEPOLLING: "true"
      NODE_ENV: development
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0"

volumes:
  frontend_node_modules:
```

- [ ] **Step 2: Validate the compose file**

Run: `docker compose config --quiet && echo "compose OK"`
Expected: `compose OK` (no schema/interpolation errors; confirms `backend/.env` is readable).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): compose dev stack (backend :8001 + frontend :5173)"
```

---

### Task 3: Makefile convenience targets

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Add the targets to `.PHONY`** — append `docker-up docker-down` to the existing `.PHONY` line (currently ends with `ui-install ui-dev ui-build ui-server api-dev`):

```make
        ui-install ui-dev ui-build ui-server api-dev docker-up docker-down
```

- [ ] **Step 2: Add the targets** at the end of the file:

```make
docker-up: ## Start the Dockerized dev stack (backend :8001 + frontend :5173, hot reload)
	docker compose up --build

docker-down: ## Stop and remove the Dockerized dev stack
	docker compose down
```

- [ ] **Step 3: Verify help lists them**

Run: `make help | grep -E 'docker-up|docker-down'`
Expected: both lines appear with their `## ` descriptions.

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "feat(docker): make docker-up / docker-down targets"
```

---

### Task 4: Full-stack smoke verification

**Files:** none (verification only).

- [ ] **Step 1: Bring the stack up**

Run: `docker compose up --build -d`
Expected: `backend` and `frontend` containers created and started. (First run installs frontend deps into the named volume — allow ~1 min.)

- [ ] **Step 2: Backend health**

Run: `sleep 8 && curl -s -m 20 localhost:8001/healthz`
Expected: `{"status":"ok","db":"ok"}`
(If connection refused, the frontend `npm install` may still be running; re-check `docker compose logs backend`.)

- [ ] **Step 3: Frontend serves**

Run: `curl -s -o /dev/null -w "%{http_code}\n" localhost:5173`
Expected: `200` (Vite dev server). May take longer on first run while deps install — poll `docker compose logs -f frontend` until you see `VITE ready`.

- [ ] **Step 4: Hot reload (manual)**

Edit a string in `backend/src/intraday_trade_spy/api/routers/health.py` (or any backend source) → `docker compose logs backend` shows `Reloading...`. Edit a visible string in a frontend component → the browser at `http://localhost:5173` updates without a full reload. Revert the edits.

- [ ] **Step 5: Tear down**

Run: `docker compose down`
Expected: containers removed; the `frontend_node_modules` named volume persists for fast next start.

---

## Self-Review

- **Spec coverage:** §3 `backend/Dockerfile.dev` → Task 1; `docker-compose.yml` → Task 2; Makefile targets → Task 3; §5 verification → Task 4. Prod `Dockerfile`/`fly.toml` untouched (no task — correct). ✓
- **Placeholders:** none — every file's full content is inline.
- **Consistency:** service name `backend` builds `Dockerfile.dev` (Task 1) referenced by compose (Task 2); port `8001` matches `VITE_API_BASE_URL` in `frontend/.env`; `frontend_node_modules` volume declared and mounted; `make` targets match the `## `-help convention used in the existing Makefile.
- **Risk note:** `docker compose config` reads `backend/.env`; if missing, Task 2 Step 2 fails fast with a clear error (copy `backend/.env.example` first).
