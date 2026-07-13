#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required. Install Docker Engine with Compose v2, then rerun %s.\n' "$0" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  printf 'Docker Compose v2 is required. Verify that `docker compose version` works.\n' >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  printf 'The Docker daemon is unavailable or this user cannot access it.\n' >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.template .env
  chmod 600 .env
  printf 'Created %s/.env. Replace every <...> placeholder, then rerun %s.\n' "$ROOT_DIR" "$0"
  exit 2
fi

if grep -Eq '^[A-Z0-9_]+=[[:space:]]*<[^>]+>[[:space:]]*$' .env; then
  printf 'Configuration is incomplete: replace every <...> value in %s/.env.\n' "$ROOT_DIR" >&2
  exit 2
fi

if ! grep -Eq '^COMPOSE_PROJECT_NAME=[a-zA-Z0-9][a-zA-Z0-9_-]*$' .env; then
  printf 'Set a non-empty COMPOSE_PROJECT_NAME in %s/.env to isolate this deployment.\n' "$ROOT_DIR" >&2
  exit 2
fi

docker compose config --quiet
docker compose up --detach --build --wait

published_address="$(docker compose port frontend 3000)"
printf 'Docent is ready at the frontend binding %s.\n' "$published_address"
printf 'Stop it without deleting data by running: docker compose down\n'
