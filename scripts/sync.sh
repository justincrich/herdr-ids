#!/usr/bin/env sh
# Make this machine and the named hc machines run the same herdr-ids build.
#   ./scripts/sync.sh                 # this machine
#   ./scripts/sync.sh holocron        # this machine + holocron
#   ./scripts/sync.sh --all           # every connected machine that has Herdr
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
version=$(cat "$here/VERSION" 2>/dev/null || echo unknown)
layout=main-ids

status_line() {
  python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print("layout=%s errors=%s" % (d.get("layout"), d.get("errors")))
except Exception:
    print("no running window")'
}

install_here() {
  "$here/install.sh" >/dev/null
  herdr-app do layout.switch --name "$layout" >/dev/null 2>&1 || true
  printf '%-12s %-7s ' local "$version"
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
  tar czf - -C "$here" mods layouts | hc exec -i --on "$m" sh -c 'cd ~/.config/herdr-app && tar xzf -' >/dev/null
  hc exec --on "$m" sh -c "printf '%s\n' '$version' > ~/.config/herdr-app/.herdr-ids-version" >/dev/null
  hc exec --on "$m" herdr-app do layout.switch --name "$layout" >/dev/null 2>&1 || true
  printf '%-12s %-7s ' "$m" "$version"
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

echo "herdr-ids $version"
install_here
for m in $targets; do install_remote "$m"; done
