# intraday-trade-spy backend — production image
# See specs/006-fastapi-service-expansion/quickstart.md §11.
#
# Build:  docker build -t intraday-trade-spy:dev backend/
# Run:    docker run --rm -p 8000:8000 --env-file backend/.env intraday-trade-spy:dev
#
# Feature 008 deploys this exact image to Fly.io via fly.toml.

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install build deps (a thin layer for cryptography wheels etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        && rm -rf /var/lib/apt/lists/*

# Copy only metadata first to maximize layer cache hits
COPY pyproject.toml /app/

# Source must come BEFORE the install (editable installs read package source)
COPY src /app/src
COPY config /app/config
COPY db /app/db

# Install runtime deps only (no [dev])
RUN pip install --upgrade pip && pip install -e .

# Drop build deps from the image
RUN apt-get purge -y build-essential && apt-get autoremove -y

EXPOSE 8000

# Health-check the same endpoint Fly.io will use
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1

CMD ["uvicorn", "intraday_trade_spy.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
