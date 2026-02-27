#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found in $ROOT_DIR" >&2
  echo "Create it from env.example (see DEPLOYMENT.md)." >&2
  exit 1
fi

echo "==> Updating repo"
git fetch --all
# If this is on a detached HEAD, this will still work.
git reset --hard origin/main

echo "==> Starting containers"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Pruning old images"
docker image prune -f

echo "==> Done"
