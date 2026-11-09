#!/bin/sh
# Run `herdr-app check` with a timeout.
#
# Why: a mod that fails to load can leave check running instead of exiting 1,
# and on macOS a successful check prints a harmless AppKit notification warning.
# A timeout is therefore treated as a failure, not as a pass.
#
#   ./scripts/check-mod.sh mods/chief-of-staff [seconds]

set -eu

mod="${1:?usage: check-mod.sh <mod folder> [seconds]}"
seconds="${2:-20}"

if [ ! -d "$mod" ]; then
  echo "FAIL: no such mod folder: $mod" >&2
  exit 1
fi

out=$(mktemp "${TMPDIR:-/tmp}/check-mod.XXXXXX")
trap 'rm -f "$out"' EXIT

herdr-app check "$mod" >"$out" 2>&1 &
pid=$!

elapsed=0
while kill -0 "$pid" 2>/dev/null; do
  if [ "$elapsed" -ge "$seconds" ]; then
    kill -9 "$pid" 2>/dev/null || true
    echo "FAIL: herdr-app check did not finish in ${seconds}s for $mod" >&2
    grep -v "scheduleApplicationNotification" "$out" >&2 || true
    exit 1
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

set +e
wait "$pid"
code=$?
set -e

grep -v "scheduleApplicationNotification" "$out" || true

if [ "$code" -ne 0 ]; then
  echo "FAIL: herdr-app check exited $code for $mod" >&2
  exit "$code"
fi

echo "PASS: $mod loaded"
