#!/usr/bin/env sh
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
exec "$root/scripts/sync.sh" --verify local
