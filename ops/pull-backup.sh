#!/usr/bin/env bash
#
# Pulls the newest verified RaidPresence backup from the prod host to this machine,
# so the dumps exist in two places instead of only next to the database they protect.
#
# Installed as ~/.local/bin/raidpresence-pull-backup.sh, run by the user's cron.
# Source of truth is this file in the RaidPresence repo.
#
# Deliberately NOT inside OneDrive: the dumps contain Discord usernames and IDs, and
# nothing is gained by syncing them to a cloud drive that also feeds a public blog.
#
# Disk discipline: this host runs at ~89% full, so retention is short and the script
# refuses to write when free space is low. One dump is ~80 KB, but a stuck loop is
# what fills disks, not the steady state.
#
set -euo pipefail

REMOTE="${REMOTE:-root@87.106.209.41}"
REMOTE_DIR="${REMOTE_DIR:-/root/backups}"
DEST="${DEST:-$HOME/backups/raidpresence}"
LOG="${LOG:-$HOME/.local/state/raidpresence-pull-backup.log}"
STATUS="${STATUS:-$DEST/.last-status}"

KEEP="${KEEP:-7}"                 # newest N dumps kept locally
MIN_FREE_MB="${MIN_FREE_MB:-2048}" # refuse to pull below this much free space

timestamp() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { printf '%s %s\n' "$(timestamp)" "$*" >> "$LOG"; }

fail() {
  log "FAIL: $*"
  mkdir -p "$DEST"
  printf 'fail %s %s\n' "$(timestamp)" "$*" > "$STATUS"
  exit 1
}

mkdir -p "$DEST" "$(dirname "$LOG")"

free_mb="$(df -Pm "$DEST" | awk 'NR==2 {print $4}')"
[ "${free_mb:-0}" -ge "$MIN_FREE_MB" ] \
  || fail "only ${free_mb}MB free at $DEST (need ${MIN_FREE_MB}MB)"

# Newest file by name — the timestamp is in it, so lexical order is chronological.
newest="$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$REMOTE" \
  "ls -1 $REMOTE_DIR/raidpresence-*.sql.gz 2>/dev/null | sort | tail -1")" \
  || fail "cannot reach $REMOTE"
[ -n "$newest" ] || fail "no backup files found in $REMOTE:$REMOTE_DIR"

base="$(basename "$newest")"
target="$DEST/$base"

if [ -f "$target" ]; then
  # The remote runs at 03:15 UTC; if we already hold that file the remote job did not
  # produce a new one. Say so rather than reporting a cheerful success.
  log "SKIP $base already present — remote produced nothing newer"
  printf 'stale %s %s\n' "$(timestamp)" "$base" > "$STATUS"
  exit 0
fi

tmp="$DEST/.incoming-$$.gz"
trap 'rm -f "$tmp"' EXIT

scp -q -o BatchMode=yes -o ConnectTimeout=15 "$REMOTE:$newest" "$tmp" \
  || fail "scp of $base failed"

# Verify locally instead of trusting the transfer: gzip integrity, then the same
# completion marker the remote script checks, read straight out of the archive.
gzip -t "$tmp" || fail "$base is not a valid gzip after transfer"
gunzip -c "$tmp" | grep -q 'PostgreSQL database dump complete' \
  || fail "$base is missing its completion marker after transfer"

mv "$tmp" "$target"
trap - EXIT

size="$(stat -c %s "$target")"
log "OK $base ($size bytes)"
printf 'ok %s %s %s bytes\n' "$(timestamp)" "$base" "$size" > "$STATUS"

# Rotation only after a verified pull, so a bad day never deletes good history.
ls -1 "$DEST"/raidpresence-*.sql.gz 2>/dev/null \
  | sort | head -n -"$KEEP" | xargs -r rm -f

find "$DEST" -maxdepth 1 -name '.incoming-*' -mtime +1 -delete
