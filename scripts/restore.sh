#!/usr/bin/env bash
# Restore a backup made by backup.sh, replacing ALL the current data of the database.
#   scripts/restore.sh backups/urantiad-20260930-073000.dump
# The backend is stopped meanwhile so nobody writes during the restore; if anything fails,
# the restore is rolled back (single transaction) and the previous data stay.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.production}"
compose() { docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"; }

file="${1:-}"
if [[ -z "$file" || ! -f "$file" ]]; then
  echo "Uso: $0 backups/urantiad-AAAAMMDD-HHMMSS.dump" >&2
  exit 1
fi

database="$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2 || true)"
database="${database:-urantiad}"
read -r -p "Se reemplazarán TODOS los datos de la base '$database' con $file. Escriba el nombre de la base para confirmar: " answer
if [[ "$answer" != "$database" ]]; then
  echo "Cancelado." >&2
  exit 1
fi

compose stop backend
trap 'compose start backend' EXIT
compose exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' \
  <"$file"
echo "Restauración completa desde $file."
