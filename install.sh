#!/usr/bin/env sh
# Install the copy-ID Herdr mods into one Herdr app home.
#   ./install.sh                              # this machine (~/.config/herdr-app)
#   HERDR_APP_HOME=/path/to/home ./install.sh # a specific home
set -eu
here=$(cd "$(dirname "$0")" && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
version=$(cat "$here/VERSION" 2>/dev/null || echo unknown)

mkdir -p "$home/mods" "$home/layouts"
for m in "$here"/mods/ids-*; do
  [ -d "$m" ] || continue
  rm -rf "$home/mods/$(basename "$m")"
  cp -R "$m" "$home/mods/"
done
cp "$here"/layouts/main-ids.json "$here"/layouts/terminals-ids.json "$home/layouts/"
printf '%s\n' "$version" > "$home/.herdr-ids-version"

echo "installed herdr-ids $version into $home"
echo "apply:  HERDR_APP_HOME=$home herdr-app do layout.switch --name main-ids"
echo "check:  HERDR_APP_HOME=$home herdr-app check $home/mods/ids-menu"
