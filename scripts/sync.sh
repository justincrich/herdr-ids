#!/usr/bin/env sh
# Make this device and the named hc machines pull the published herdr-ids build.
#   ./scripts/sync.sh                 # this device
#   ./scripts/sync.sh holocron        # this device + holocron
#   ./scripts/sync.sh --all           # every connected machine that has Herdr
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
raw=https://raw.githubusercontent.com/justincrich/herdr-ids/main/bootstrap.sh

status_line() {
  python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print("layout=%s errors=%s" % (d.get("layout"), d.get("errors")))
except Exception:
    print("no running window")'
}

install_here() {
  "$here/install.sh" --link >/dev/null
  printf '%-12s %-7s ' local "$(cat "$here/VERSION")"
  herdr-app status 2>/dev/null | status_line
}

has_herdr() {
  hc exec --on "$1" sh -c 'test -d ~/.config/herdr-app && command -v herdr-app >/dev/null' >/dev/null 2>&1
}

install_remote() {
  m=$1
  if ! has_herdr "$m"; then
    printf '%-12s %-7s skipped (no Herdr)\n' "$m" "-"
    return 0
  fi
  hc exec --on "$m" sh -c "curl -fsSL $raw | sh" >/dev/null
  printf '%-12s %-7s ' "$m" "$(hc exec --on "$m" sh -c 'cat ~/Projects/herdr-ids/VERSION')"
  hc exec --on "$m" herdr-app status 2>/dev/null | status_line
}

targets=""
for a in "$@"; do
  case "$a" in
    --all)
      for m in $(hc machine ls --json 2>/dev/null | python3 -c 'import json,sys
print(" ".join(m["name"] for m in json.load(sys.stdin).get("machines",[]) if m.get("state")=="connected"))'); do
        targets="$targets $m"
      done ;;
    -*) echo "unknown flag: $a" >&2; exit 2 ;;
    *) targets="$targets $a" ;;
  esac
done

if [ -n "$(git -C "$here" status --porcelain 2>/dev/null)" ]; then
  echo "warning: local changes are not pushed; remote devices get the repo's version" >&2
fi

echo "herdr-ids (repo: https://github.com/justincrich/herdr-ids)"
install_here
for m in $targets; do install_remote "$m"; done
