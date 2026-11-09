#!/usr/bin/env sh
# Point git at this repo's hooks, so a commit deploys this checkout to the app
# home and checks the mods it touches. Idempotent.
#
#   ./scripts/install-hooks.sh
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
current=$(git -C "$here" config --get core.hooksPath 2>/dev/null || true)
if [ "$current" = ".githooks" ]; then
  printf 'hooks already installed in %s\n' "$here"
else
  git -C "$here" config core.hooksPath .githooks
  printf 'hooks installed in %s (core.hooksPath=.githooks)\n' "$here"
fi
