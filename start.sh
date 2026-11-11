#!/usr/bin/env bash
# start.sh — Starts all dev dependencies for support247_bobathon.
#
# What it does:
#   1. Ensures Docker Desktop is running (macOS).
#   2. Brings up postgres, redis, and adminer via docker-compose (idempotent).
#   3. Waits for postgres and redis to be healthy.
#   4. Activates the Python venv and starts the FastAPI dev server (uvicorn).

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
VENV="$PROJECT_ROOT/.venv"
ENV_FILE="$PROJECT_ROOT/.env"

# ─── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[start]${RESET} $*"; }
ok()   { echo -e "${GREEN}[✓]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!]${RESET} $*"; }
die()  { echo -e "${RED}[✗]${RESET} $*" >&2; exit 1; }

# ─── 1. Docker Desktop (macOS) ───────────────────────────────────────────────
ensure_docker_running() {
  if docker info &>/dev/null; then
    ok "Docker is already running."
    return
  fi

  warn "Docker is not running — attempting to start Docker Desktop..."

  if [[ "$(uname)" == "Darwin" ]]; then
    open -a Docker
  else
    # Linux: try starting the daemon directly
    if command -v systemctl &>/dev/null; then
      sudo systemctl start docker
    else
      die "Cannot start Docker automatically. Please start it manually."
    fi
  fi

  log "Waiting for Docker to become ready..."
  local attempts=0
  until docker info &>/dev/null; do
    ((attempts++))
    if (( attempts > 30 )); then
      die "Docker did not become ready within 60 s. Please start it manually."
    fi
    sleep 2
  done
  ok "Docker is ready."
}

# ─── 2. Docker Compose services ──────────────────────────────────────────────
start_docker_services() {
  log "Starting docker-compose services: postgres, redis, adminer..."
  docker-compose -f "$COMPOSE_FILE" up postgres redis adminer -d --remove-orphans
  ok "Docker services started (or already running)."
}

# ─── 3. Wait for healthy services ────────────────────────────────────────────
wait_for_service() {
  local name="$1"
  local max=30
  local attempt=0

  log "Waiting for $name to be healthy..."
  until [[ "$(docker inspect --format='{{.State.Health.Status}}' "$name" 2>/dev/null)" == "healthy" ]]; do
    ((attempt++))
    if (( attempt > max )); then
      die "$name did not become healthy within $((max * 2))s."
    fi
    sleep 2
  done
  ok "$name is healthy."
}

# ─── 4. Start FastAPI (uvicorn) ───────────────────────────────────────────────
start_api() {
  log "Activating Python venv and starting FastAPI dev server..."

  if [[ ! -d "$VENV" ]]; then
    die "Virtual environment not found at $VENV. Run: python -m venv .venv && pip install -r requirements.txt"
  fi

  # Load .env so the local process has the same variables as docker containers
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    ok "Loaded .env"
  else
    warn ".env not found — using environment defaults."
  fi

  # Activate venv
  # shellcheck disable=SC1090
  source "$VENV/bin/activate"

  log "FastAPI → http://localhost:8001  |  Docs → http://localhost:8001/docs"
  log "Press Ctrl+C to stop."

  cd "$PROJECT_ROOT"
  exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8001 \
    --reload \
    --reload-dir app
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo -e "\n${BOLD}╔══════════════════════════════════════╗"
  echo -e "║   support247 — dev startup           ║"
  echo -e "╚══════════════════════════════════════╝${RESET}\n"

  ensure_docker_running
  start_docker_services
  wait_for_service "multiagent-postgres"
  wait_for_service "multiagent-redis"
  start_api
}

main "$@"
