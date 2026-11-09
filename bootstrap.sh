#!/usr/bin/env sh
# Clone or pull herdr-ids, then link it into this device's Herdr app home.
#   ./bootstrap.sh
#   HERDR_IDS_DIR=/path ./bootstrap.sh
#   HERDR_IDS_REPO=<url> ./bootstrap.sh
set -eu
dir=${HERDR_IDS_DIR:-$HOME/Projects/herdr-ids}
repo=${HERDR_IDS_REPO:-https://github.com/justincrich/herdr-ids}

if [ -d "$dir/.git" ]; then
  git -C "$dir" pull --ff-only
else
  mkdir -p "$(dirname "$dir")"
  git clone --depth 1 "$repo" "$dir"
fi

"$dir/install.sh" --link
"$dir/scripts/install-hooks.sh" >/dev/null
herdr-app do layout.switch --name main-ids >/dev/null 2>&1 || true
printf 'herdr-ids %s ready: %s -> %s\n' "$(cat "$dir/VERSION")" "$dir" "${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
