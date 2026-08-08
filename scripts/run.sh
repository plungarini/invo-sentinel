#!/usr/bin/env bash
# Restart-on-crash wrapper for the auto-copy daemon. The daemon itself logs
# fatal errors and exits(1) rather than dying silently (see
# process.on('uncaughtException'/'unhandledRejection') in
# src/cli/auto-copy.ts); this script is what actually brings it back up
# afterward. State (.copy-state.json) and logs/ both persist across
# restarts, so a restart picks up right where it left off.
#
# Usage: ./scripts/run.sh [minMarginPct] [maxMarginPct] [--dry-run]

cd "$(dirname "$0")/.."

RESTART_DELAY=5

while true; do
  echo "[run] starting $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  npx tsx src/cli/auto-copy.ts "$@"
  code=$?
  echo "[run] exited with code $code, restarting in ${RESTART_DELAY}s"
  sleep "$RESTART_DELAY"
done
