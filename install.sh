#!/usr/bin/env sh
# Install the copy-ID Herdr mods into a Herdr app home.
#   ./install.sh                 # this machine: ~/.config/herdr-app
#   HERDR_APP_HOME=/path ./install.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
mkdir -p "$home/mods" "$home/layouts"
for m in "$here"/mods/ids-*; do
  [ -d "$m" ] || continue
  rm -rf "$home/mods/$(basename "$m")"
  cp -R "$m" "$home/mods/"
done
cp "$here"/layouts/main-ids.json "$here"/layouts/terminals-ids.json "$home/layouts/"
echo "installed into $home"
echo "apply with:  HERDR_APP_HOME=$home herdr-app do layout.switch --name main-ids"
echo "check with:  HERDR_APP_HOME=$home herdr-app check $home/mods/ids-menu"
