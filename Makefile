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

.PHONY: help install test test-slow backtest backtest-real demo download \
        download-clean lint clean-runs venv

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

test: ## Run the offline test suite (default)
	cd backend && .venv/bin/pytest -q -m "not slow"

test-slow: ## Run only the slow tests (real yfinance — needs internet)
	cd backend && .venv/bin/pytest -q -m slow

backtest: ## Run a backtest against the bundled synthetic fixture
	cd backend && .venv/bin/intraday-trade-spy-backtest --config config/config.yaml

backtest-real: ## Run a backtest against a downloaded CSV (set DATA=<filename>)
	@if [ -z "$(DATA)" ]; then \
	  echo "usage: make backtest-real DATA=spy_5m_YYYY-MM-DD_YYYY-MM-DD.csv"; \
	  exit 1; \
	fi
	cd backend && .venv/bin/intraday-trade-spy-backtest \
	    --config config/config.yaml \
	    --data data/raw/$(DATA)

demo: ## Backtest the fixture with a permissive cap so trades execute
	@sed 's/max_position_value_pct: 25.0/max_position_value_pct: 600.0/' \
	    backend/config/config.yaml > /tmp/itspy-permissive.yaml
	cd backend && .venv/bin/intraday-trade-spy-backtest \
	    --config /tmp/itspy-permissive.yaml
	@rm -f /tmp/itspy-permissive.yaml

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
