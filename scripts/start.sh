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

mkdir -p bin/logs

# The dashboard UI is a separate Node.js process (ui/server.js, present only
# if this release includes it) - started alongside the daemon, not instead
# of it. Node itself isn't bundled (unlike the daemon, which is a
# self-contained binary), so this is skipped with a clear message if it's
# missing rather than failing silently.
if [ -f "ui/server.js" ]; then
  if command -v node >/dev/null 2>&1; then
    (cd ui && PORT=4400 node server.js >> ../bin/logs/ui.log 2>&1 &)
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

RESTART_DELAY=5

while true; do
  echo "[start] starting $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ./bin/invo-sentinel "$@"
  code=$?
  echo "[start] exited with code $code, restarting in ${RESTART_DELAY}s"
  sleep "$RESTART_DELAY"
done
