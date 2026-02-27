#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash deploy/maintenance.sh status
  bash deploy/maintenance.sh on
  bash deploy/maintenance.sh off

What it does:
  - Updates MAINTENANCE_MODE in .env (true/false)
  - Recreates only the API container so the env change applies immediately

Notes:
  - This affects API routes guarded by the maintenance gate.
  - /api/maintenance remains accessible.
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found in $ROOT_DIR" >&2
  echo "Create it from env.example (see DEPLOYMENT.md)." >&2
  exit 1
fi

cmd="${1:-}"
if [[ -z "$cmd" || "$cmd" == "-h" || "$cmd" == "--help" ]]; then
  usage
  exit 0
fi

compose=(docker compose -f docker-compose.prod.yml)

web_container_name="airsofthub_web"

get_env_value() {
  local key="$1"
  if [[ -f .env ]]; then
    local line
    line="$(grep -E "^${key}=" .env | tail -n 1 || true)"
    if [[ -n "$line" ]]; then
      echo "${line#*=}" | sed -E 's/^"(.*)"$/\1/'
      return 0
    fi
  fi
  return 1
}

set_env_value() {
  local key="$1"
  local value="$2" # should already be quoted/escaped as needed

  if grep -qE "^${key}=" .env; then
    # Replace any existing occurrences.
    # (Keeping multiple copies of the same key in .env is ambiguous anyway.)
    sed -i -E "s|^${key}=.*$|${key}=${value}|" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

restart_api() {
  echo "==> Recreating API container"
  "${compose[@]}" up -d --force-recreate --no-deps api
}

maintenance_probe() {
  # Best-effort probe of the health/maintenance endpoint.
  if command -v curl >/dev/null 2>&1; then
    curl -sS -i http://127.0.0.1/api/maintenance || true
  # Use the web container's network namespace so we don't depend on the compose project/network name.
  elif docker ps --format '{{.Names}}' | grep -qx "$web_container_name"; then
    docker run --rm --network "container:${web_container_name}" curlimages/curl:8.6.0 -sS -i http://localhost/api/maintenance || true
  else
    echo "(web container not running; skipping endpoint probe)"
  fi
}

case "$cmd" in
  status)
    current="$(get_env_value MAINTENANCE_MODE || echo '')"
    if [[ -z "$current" ]]; then
      echo "MAINTENANCE_MODE is not set in .env (defaults to false in app)."
    else
      echo "MAINTENANCE_MODE=$current"
    fi

    echo "==> API maintenance endpoint"
    maintenance_probe
    ;;

  on)
    echo "==> Enabling maintenance mode"
    set_env_value MAINTENANCE_MODE '"true"'
    restart_api
    ;;

  off)
    echo "==> Disabling maintenance mode"
    set_env_value MAINTENANCE_MODE '"false"'
    restart_api
    ;;

  *)
    echo "Unknown command: $cmd" >&2
    usage
    exit 2
    ;;
esac
