#!/usr/bin/env sh
# Install the copy-ID Herdr mods into one Herdr app home.
#   ./install.sh                 # symlink this checkout into ~/.config/herdr-app
#   ./install.sh --copy          # copy instead (self-contained, no repo needed)
#   HERDR_APP_HOME=/path ./install.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
version=$(cat "$here/VERSION" 2>/dev/null || echo unknown)
mode=link
for a in "$@"; do
  case "$a" in
    --link) mode=link ;;
    --copy) mode=copy ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done

mkdir -p "$home/mods" "$home/layouts"

for src in "$here"/mods/ids-*; do
  [ -d "$src" ] || continue
  dst="$home/mods/$(basename "$src")"
  rm -rf "$dst"
  if [ "$mode" = link ]; then ln -s "$src" "$dst"; else cp -R "$src" "$dst"; fi
done

for src in "$here"/layouts/*-ids.json; do
  [ -f "$src" ] || continue
  dst="$home/layouts/$(basename "$src")"
  rm -f "$dst"
  if [ "$mode" = link ]; then ln -s "$src" "$dst"; else cp "$src" "$dst"; fi
done

printf '%s\n' "$version" > "$home/.herdr-ids-version"
printf '%s\n' "$here" > "$home/.herdr-ids-source"

echo "installed herdr-ids $version into $home ($mode)"
echo "apply:  HERDR_APP_HOME=$home herdr-app do layout.switch --name main-ids"
