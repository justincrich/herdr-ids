#!/usr/bin/env sh
# Run in an existing publishing clone. Never pull or replace a development tree.
set -eu
root=$(cd "$(dirname "$0")" && pwd)
node=${1:?usage: bootstrap.sh <laptop|holocron|publisher-name>}
"$root/scripts/sync.sh" --init "$node"
"$root/scripts/sync.sh" --install-service
"$root/scripts/install-hooks.sh"
"$root/scripts/sync.sh"
