# intraday-trade-spy — task runner
#
# Every target cd's into backend/ first so the relative paths in
# config.yaml (data/raw/..., data/backtests/...) resolve correctly.
#
# Usage examples:
#   make help
#   make install
#   make test
#   make backtest
#   make demo                                       # bump cap → real trades
#   make download START=2026-04-01 END=2026-04-15
#   make backtest-real DATA=spy_5m_2026-04-01_2026-04-15.csv

SHELL := /bin/bash
PY    := backend/.venv/bin/python
PIP   := backend/.venv/bin/pip

# --- default fetch range: last 30 calendar days (macOS `date -v`) ---
START ?= $(shell date -v-30d +%Y-%m-%d)
END   ?= $(shell date -v-1d +%Y-%m-%d)

# Optional override for backtest data file (relative to backend/data/raw/).
# If unset, the backtester uses the synthetic fixture in config.yaml.
DATA ?=

# Config file used by `make backtest` / `make backtest-real` (relative to
# backend/). Override with: make backtest CONFIG=config/presets/aggressive.yaml
# Drop preset YAMLs under backend/config/presets/ so they're easy to find.
CONFIG ?= config/config.yaml

# Port for the FastAPI static server (override with: make ui-server PORT=9000).
PORT ?= 8000

# How many most-recent backtest runs to keep with `make prune-runs`.
KEEP ?= 5

# PUSH=1 appends --push-to-supabase to backtest invocations (Feature 005).
# Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_USER_ID in env.
PUSH ?=
PUSH_FLAG := $(if $(PUSH),--push-to-supabase,)

.PHONY: help install test test-slow test-integration backtest backtest-real demo download \
        download-clean lint clean-runs prune-runs venv \
        ui-install ui-dev ui-build ui-server

help: ## Show this help
	@echo "intraday-trade-spy task runner"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "} {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Environment overrides:"
	@echo "  START=YYYY-MM-DD   download / fetch start date (default: 30d ago)"
	@echo "  END=YYYY-MM-DD     download / fetch end date   (default: yesterday)"
	@echo "  DATA=<csv-name>    backtest input CSV under backend/data/raw/"
	@echo "  CONFIG=<path>      config file relative to backend/ (default: config/config.yaml)"
	@echo "  KEEP=N             prune-runs keeps N most-recent runs (default: 5)"
	@echo "  PUSH=1             after backtest, push the run to Supabase (Feature 005)"

venv: backend/.venv/bin/python ## Create the venv if it doesn't exist
backend/.venv/bin/python:
	cd backend && python3 -m venv .venv

install: venv ## Install the package + dev deps in editable mode
	cd backend && .venv/bin/pip install --upgrade pip --quiet
	cd backend && .venv/bin/pip install -e ".[dev]"
	@echo ""
	@echo "Installed. Console scripts available:"
	@echo "  intraday-trade-spy-backtest --help"
	@echo "  intraday-trade-spy-download --help"

test: ## Run the offline test suite (default; excludes slow and integration tests)
	cd backend && .venv/bin/pytest -q -m "not slow and not integration"

test-slow: ## Run only the slow tests (real yfinance — needs internet)
	cd backend && .venv/bin/pytest -q -m slow

test-integration: ## Run Supabase integration tests (needs Docker + Supabase CLI + SUPABASE_INTEGRATION=1)
	cd backend && SUPABASE_INTEGRATION=1 .venv/bin/pytest -q -m integration

backtest: ## Run a backtest (CONFIG=<path> for presets; PUSH=1 to push to Supabase)
	cd backend && .venv/bin/intraday-trade-spy-backtest --config $(CONFIG) $(PUSH_FLAG)

backtest-real: ## Run a backtest against a downloaded CSV (set DATA=<filename>; PUSH=1 to push)
	@if [ -z "$(DATA)" ]; then \
	  echo "usage: make backtest-real DATA=spy_5m_YYYY-MM-DD_YYYY-MM-DD.csv"; \
	  exit 1; \
	fi
	cd backend && .venv/bin/intraday-trade-spy-backtest \
	    --config $(CONFIG) \
	    --data data/raw/$(DATA) $(PUSH_FLAG)

demo: ## Backtest with the permissive demo preset (cap=1500%, trades execute)
	cd backend && .venv/bin/intraday-trade-spy-backtest \
	    --config config/presets/demo.yaml

download: ## Download real SPY 5m bars from yfinance (override with START=/END=)
	cd backend && .venv/bin/intraday-trade-spy-download \
	    --start $(START) --end $(END)

download-clean: ## Remove all downloaded SPY CSVs (keeps the synthetic fixture)
	@find backend/data/raw -name 'spy_5m_2*.csv*' -print -delete

lint: ## Run ruff check + format check
	cd backend && .venv/bin/ruff check src tests
	cd backend && .venv/bin/ruff format --check src tests

clean-runs: ## Remove all backtest run outputs (keeps .gitkeep)
	@find backend/data/backtests -mindepth 1 -not -name '.gitkeep' -delete
	@echo "Cleaned backend/data/backtests/"

prune-runs: ## Keep only the KEEP most-recent backtest runs (default KEEP=5)
	@to_remove=$$(ls -1d backend/data/backtests/*/ 2>/dev/null | sort -r | tail -n +$$(($(KEEP) + 1))); \
	  if [ -z "$$to_remove" ]; then \
	    n=$$(ls -1d backend/data/backtests/*/ 2>/dev/null | wc -l | tr -d ' '); \
	    echo "Have $$n run(s), keeping $(KEEP) — nothing to prune."; \
	  else \
	    echo "$$to_remove" | xargs rm -rf; \
	    n=$$(ls -1d backend/data/backtests/*/ 2>/dev/null | wc -l | tr -d ' '); \
	    echo "Pruned. $$n run(s) remain (target KEEP=$(KEEP))."; \
	  fi

ui-install: ## Install frontend dependencies (npm install in frontend/)
	cd frontend && npm install

ui-dev: ## Start the Vite dev server (http://localhost:5173)
	cd frontend && npm run dev

ui-build: ## Production build → frontend/dist/
	cd frontend && npm run build

ui-server: ## Start the FastAPI static server (override PORT=9000)
	cd backend && .venv/bin/intraday-trade-spy-server --port $(PORT)
