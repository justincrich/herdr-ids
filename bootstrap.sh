#!/usr/bin/env sh
# Pull herdr-ids from GitHub and install it on this device.
#   ./bootstrap.sh
#   HERDR_IDS_DIR=/path ./bootstrap.sh
#   HERDR_IDS_REPO=<url> ./bootstrap.sh
set -eu
dir=${HERDR_IDS_DIR:-$HOME/.local/share/herdr-ids}
repo=${HERDR_IDS_REPO:-https://github.com/justincrich/herdr-ids}

if [ -d "$dir/.git" ]; then
  git -C "$dir" pull --ff-only
else
  mkdir -p "$(dirname "$dir")"
  git clone --depth 1 "$repo" "$dir"
fi

"$dir/install.sh"
herdr-app do layout.switch --name main-ids >/dev/null 2>&1 || true
printf 'herdr-ids %s ready from %s\n' "$(cat "$dir/VERSION")" "$dir"
