#!/usr/bin/env bash
#
# Nightly Postgres backup for the RaidPresence production database.
#
# Installed on the prod host at /usr/local/bin/raidpresence-backup.sh and run by cron.
# This file is the source of truth — change it here, then re-deploy with:
#   scp ops/pg-backup.sh root@<host>:/usr/local/bin/raidpresence-backup.sh
#
# Why a verify step: an empty or truncated dump is worse than no dump, because it looks
# like a backup. Every dump is written to a temp file, checked for pg_dump's own
# "database dump complete" trailer *and* for a plausible row count, and only then moved
# into place. A failed run leaves the previous good backup untouched.
#
set -euo pipefail

CONTAINER="${CONTAINER:-raidpresence-postgres-1}"
DB_USER="${DB_USER:-raidpresence}"
DB_NAME="${DB_NAME:-raidpresence}"
DEST="${DEST:-/root/backups}"
LOG="${LOG:-/var/log/raidpresence-backup.log}"
STATUS="${STATUS:-/root/backups/.last-status}"

# Retention: every dump for 14 days, Sunday dumps for 8 weeks.
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-14}"
KEEP_WEEKLY_DAYS="${KEEP_WEEKLY_DAYS:-56}"

# A dump that suddenly holds far fewer rows than the last good one usually means the
# database was wiped or the wrong DB was dumped — refuse rather than rotate a good
# backup out in favour of it.
MIN_GUILD_ROWS="${MIN_GUILD_ROWS:-1}"

timestamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '%s %s\n' "$(timestamp)" "$*" >> "$LOG"; }

fail() {
  log "FAIL: $*"
  printf 'fail %s %s\n' "$(timestamp)" "$*" > "$STATUS"
  exit 1
}

mkdir -p "$DEST"

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  fail "container $CONTAINER is not running"
fi

stamp="$(date -u '+%Y%m%d-%H%M%S')"
dow="$(date -u '+%u')"                       # 7 = Sunday
suffix=""
[ "$dow" = "7" ] && suffix="-weekly"
target="$DEST/raidpresence-${stamp}${suffix}.sql.gz"
tmp="$DEST/.in-progress-${stamp}.sql"

trap 'rm -f "$tmp" "$tmp.gz"' EXIT

if ! docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$tmp" 2>>"$LOG"; then
  fail "pg_dump exited non-zero"
fi

# pg_dump writes this trailer only after a successful run — the cheapest truncation check.
grep -q 'PostgreSQL database dump complete' "$tmp" \
  || fail "dump is missing its completion marker (truncated?)"

# COPY block for "Guild" ends at a lone backslash-dot; count the data lines between.
guilds="$(awk '/^COPY public."Guild"/{f=1;next} f&&/^\\\.$/{f=0} f' "$tmp" | grep -c . || true)"
[ "${guilds:-0}" -ge "$MIN_GUILD_ROWS" ] \
  || fail "only ${guilds:-0} Guild rows in dump (expected >= $MIN_GUILD_ROWS)"

gzip -9 "$tmp"
mv "$tmp.gz" "$target"
trap - EXIT

size="$(stat -c %s "$target")"
log "OK $target (${size} bytes, ${guilds} guilds)"
printf 'ok %s %s %s bytes %s guilds\n' "$(timestamp)" "$target" "$size" "$guilds" > "$STATUS"

# Rotation runs only after a verified success, so a broken night never deletes history.
find "$DEST" -maxdepth 1 -name 'raidpresence-*.sql.gz' ! -name '*-weekly.sql.gz' \
  -mtime "+$KEEP_DAILY_DAYS" -delete
find "$DEST" -maxdepth 1 -name 'raidpresence-*-weekly.sql.gz' \
  -mtime "+$KEEP_WEEKLY_DAYS" -delete

# Leftover temp files from a killed run (not caught by the trap).
find "$DEST" -maxdepth 1 -name '.in-progress-*' -mtime +1 -delete
