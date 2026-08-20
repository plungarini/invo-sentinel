#!/usr/bin/env bash
# Starts the daemon - from a single command. Everything internal - the
# daemon binary, the dashboard UI's own files, its node_modules, and all
# runtime state (data/, logs/) - lives inside bin/, so this top-level
# folder only ever holds this script plus the docs a user actually reads -
# see GETTING-STARTED.txt. The daemon itself logs fatal errors and exits
# non-zero rather than dying silently; that's what actually brings it back
# up here.
#
# The dashboard UI is started and supervised by the daemon itself
# (src/services/ui-supervisor.ts, via Node's own child_process - the exact
# same code path as on Windows, no bash-side backgrounding loop needed
# here), not by this wrapper - this script only ever runs the one daemon
# process.
#
# Also owns the auto-update swap (src/services/self-updater.ts stages a new
# release under bin/.update/ and exits; this loop does the actual file swap
# with the daemon fully exited - which by then has already stopped its own
# UI child, see ui-supervisor.ts - then relaunches) and a crash-loop
# rollback: if the daemon crashes quickly right after a swap, twice in a
# row, the previous version is restored and that release is blacklisted
# (bin/.update/rollback-blocked-<version>.json) so it's never auto-retried.
#
# Usage: ./start.sh [minMarginPct] [maxMarginPct] [--dry-run]
#        ./start.sh --background   - launch detached, free this terminal immediately

cd "$(dirname "$0")"

if [ "$1" = "--background" ]; then
  shift
  mkdir -p bin/logs
  nohup "$0" "$@" > bin/logs/start.out 2>&1 &
  disown
  echo "Started in background (PID $!). Logs: bin/logs/start.out and bin/logs/auto-copy-*.log"
  exit 0
fi

mkdir -p bin/logs bin/.update

# The actual file swap for a staged update (src/services/self-updater.ts
# downloads+verifies+extracts to bin/.update/staging/ and exits; this runs
# with the daemon fully exited, so there's no self-file-lock hazard).
# Previous exe/ui/node_modules are kept as .prev for one run in case the new
# version crash-loops (see the rollback branch in the main loop below).
apply_pending_update() {
  [ -f bin/.update/pending.json ] || return 0
  if [ ! -f bin/.update/staging/bin/invo-sentinel ]; then
    echo "[start] update marker present but staging incomplete - skipping, will retry next check"
    rm -f bin/.update/pending.json
    return 0
  fi

  local new_version="unknown"
  [ -f bin/.update/pending-version.txt ] && new_version="$(cat bin/.update/pending-version.txt)"
  echo "[start] applying staged update to ${new_version}..."

  rm -f bin/invo-sentinel.prev
  mv bin/invo-sentinel bin/invo-sentinel.prev
  mv bin/.update/staging/bin/invo-sentinel bin/invo-sentinel
  chmod +x bin/invo-sentinel

  rm -rf bin/ui.prev
  [ -d bin/ui ] && mv bin/ui bin/ui.prev
  [ -d bin/.update/staging/bin/ui ] && mv bin/.update/staging/bin/ui bin/ui

  rm -rf bin/node_modules.prev
  [ -d bin/node_modules ] && mv bin/node_modules bin/node_modules.prev
  [ -d bin/.update/staging/bin/node_modules ] && mv bin/.update/staging/bin/node_modules bin/node_modules

  echo "$new_version" > bin/.update/pending-version-applied
  touch bin/.update/just-updated
  rm -f bin/.update/pending.json bin/.update/pending-version.txt
  rm -rf bin/.update/staging

  echo "[start] update to ${new_version} applied"
}

# Restores the previous version's exe/ui/node_modules from the .prev copies
# apply_pending_update always leaves behind, and permanently blocks the
# crashing version from being auto-retried - the user has to delete the
# rollback-blocked-<version>.json marker by hand to try it again.
rollback_update() {
  echo "[start] rolling back to previous version - new build crash-looped"
  local bad_version=""
  [ -f bin/.update/pending-version-applied ] && bad_version="$(cat bin/.update/pending-version-applied)"

  if [ -f bin/invo-sentinel.prev ]; then
    rm -f bin/invo-sentinel
    mv bin/invo-sentinel.prev bin/invo-sentinel
    chmod +x bin/invo-sentinel
  fi
  if [ -d bin/ui.prev ]; then
    rm -rf bin/ui
    mv bin/ui.prev bin/ui
  fi
  if [ -d bin/node_modules.prev ]; then
    rm -rf bin/node_modules
    mv bin/node_modules.prev bin/node_modules
  fi

  [ -n "$bad_version" ] && touch "bin/.update/rollback-blocked-${bad_version}.json"

  rm -f bin/.update/just-updated bin/.update/crash-count bin/.update/pending-version-applied
}

RESTART_DELAY=5
HEALTHY_RUN_SECONDS=20
MAX_CRASH_RETRIES=2

while true; do
  apply_pending_update

  start_epoch=$(date +%s)
  echo "[start] starting $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ./bin/invo-sentinel "$@"
  code=$?
  end_epoch=$(date +%s)
  run_seconds=$((end_epoch - start_epoch))
  echo "[start] exited with code $code after ${run_seconds}s"

  if [ -f bin/.update/just-updated ]; then
    if [ "$run_seconds" -ge "$HEALTHY_RUN_SECONDS" ]; then
      echo "[start] new version ran cleanly for ${run_seconds}s - update confirmed healthy"
      rm -f bin/.update/just-updated bin/.update/crash-count bin/.update/pending-version-applied
    else
      crash_count=0
      [ -f bin/.update/crash-count ] && crash_count="$(cat bin/.update/crash-count)"
      crash_count=$((crash_count + 1))
      echo "$crash_count" > bin/.update/crash-count
      echo "[start] new version crashed quickly (attempt ${crash_count}/${MAX_CRASH_RETRIES})"
      if [ "$crash_count" -ge "$MAX_CRASH_RETRIES" ]; then
        rollback_update
      fi
    fi
  fi

  echo "[start] exited with code $code, restarting in ${RESTART_DELAY}s"
  sleep "$RESTART_DELAY"
done
