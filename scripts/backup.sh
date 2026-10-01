#!/usr/bin/env bash
# Back up the production database into backups/ (compressed pg_dump custom format) and delete
# the backups older than BACKUP_KEEP_DAYS. Run from cron, e.g. every day at 02:30:
#   30 2 * * * /opt/urantiad/scripts/backup.sh >> /opt/urantiad/backups/backup.log 2>&1
# Copy backups/ off this server too: a backup on the same disk does not survive losing it.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.production}"
compose() { docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"; }

keep_days="$(grep -E '^BACKUP_KEEP_DAYS=' "$ENV_FILE" | cut -d= -f2 || true)"
keep_days="${keep_days:-14}"

mkdir -p backups
file="backups/urantiad-$(date -u +%Y%m%d-%H%M%S).dump"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

# Written to a temporary name first: an interrupted dump never looks like a valid backup.
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' >"$partial"
mv "$partial" "$file"

find backups -name 'urantiad-*.dump' -type f -mtime +"$keep_days" -delete
echo "$(date -u +%FT%TZ) Respaldo creado: $file ($(du -h "$file" | cut -f1))"
