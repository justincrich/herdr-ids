#!/usr/bin/env sh
# Publish only this repository's committed main; clients consume the catalog pair.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
export PATH="$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:$PATH"
exec python3 "$here/scripts/deploy.py" --repo herdr-ids --root "$here" "$@"
