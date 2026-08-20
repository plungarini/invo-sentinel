#!/usr/bin/env bash
# Starts everything - the daemon AND the dashboard UI (if this release
# includes one and Node.js is available) - from a single command. The
# actual daemon binary lives in bin/ (not next to this script) specifically
# so there's only one obvious thing to run at the top level - see
# GETTING-STARTED.txt. The daemon itself logs fatal errors and exits
# non-zero rather than dying silently; that's what actually brings it back
# up here. State (bin/data/sentinel.db) and bin/logs/ both live inside
# bin/, alongside the binary that owns them, and persist across restarts.
#
# Also owns the auto-update swap (src/services/self-updater.ts stages a new
# release under bin/.update/ and exits; this loop does the actual file swap
# with the daemon fully exited, then relaunches) and a crash-loop rollback:
# if the daemon crashes quickly right after a swap, twice in a row, the
# previous version is restored and that release is blacklisted
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

UI_PID_FILE="bin/.update/ui.pid"

start_ui() {
  # The dashboard UI is a separate Node.js process (ui/server.js, present only
  # if this release includes it) - started alongside the daemon, not instead
  # of it. Node itself isn't bundled (unlike the daemon, which is a
  # self-contained binary), so this is skipped with a clear message if it's
  # missing rather than failing silently.
  if [ -f "ui/server.js" ]; then
    if command -v node >/dev/null 2>&1; then
      (cd ui && PORT=4400 node server.js >> ../bin/logs/ui.log 2>&1 & echo $! > "../$UI_PID_FILE")
      (
        sleep 3
        if command -v open >/dev/null 2>&1; then open http://localhost:4400
        elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:4400
        fi
      ) &
    else
      echo "[start] Node.js not found - the dashboard UI needs it, the daemon does not."
      echo "[start] Install Node from https://nodejs.org, then re-run ./start.sh for the UI too."
    fi
  fi
}

stop_ui() {
  if [ -f "$UI_PID_FILE" ]; then
    kill "$(cat "$UI_PID_FILE")" 2>/dev/null
    rm -f "$UI_PID_FILE"
  fi
}

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

  stop_ui

  rm -f bin/invo-sentinel.prev
  mv bin/invo-sentinel bin/invo-sentinel.prev
  mv bin/.update/staging/bin/invo-sentinel bin/invo-sentinel
  chmod +x bin/invo-sentinel

  rm -rf ui.prev
  [ -d ui ] && mv ui ui.prev
  [ -d bin/.update/staging/ui ] && mv bin/.update/staging/ui ui

  rm -rf node_modules.prev
  [ -d node_modules ] && mv node_modules node_modules.prev
  [ -d bin/.update/staging/node_modules ] && mv bin/.update/staging/node_modules node_modules

  echo "$new_version" > bin/.update/pending-version-applied
  touch bin/.update/just-updated
  rm -f bin/.update/pending.json bin/.update/pending-version.txt
  rm -rf bin/.update/staging

  start_ui
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

  stop_ui

  if [ -f bin/invo-sentinel.prev ]; then
    rm -f bin/invo-sentinel
    mv bin/invo-sentinel.prev bin/invo-sentinel
    chmod +x bin/invo-sentinel
  fi
  if [ -d ui.prev ]; then
    rm -rf ui
    mv ui.prev ui
  fi
  if [ -d node_modules.prev ]; then
    rm -rf node_modules
    mv node_modules.prev node_modules
  fi

  [ -n "$bad_version" ] && touch "bin/.update/rollback-blocked-${bad_version}.json"

  rm -f bin/.update/just-updated bin/.update/crash-count bin/.update/pending-version-applied

  start_ui
}

start_ui

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
