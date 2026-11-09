#!/usr/bin/env sh
# Verify that the live Herdr app home runs this repo's main checkout.
#
# The failure this catches: a session installs from its worktree, the live app
# then renders that branch's mods and layouts, and a layout reload drops the
# nodes the branch has not got — on 2026-11-08 that took the agents/spaces
# sidebar out of every window.
#
#   ./scripts/check-home.sh              # checks ~/.config/herdr-app (live)
#   HERDR_APP_HOME=/tmp/herdr-test ./scripts/check-home.sh   # a scratch home
#
# The live home must be owned by the main checkout. A scratch home may be owned
# by any checkout (that is what worktrees test in), so it is checked for
# self-consistency instead. Read-only; exit 1 on any mismatch, naming the repair.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
canon() { (cd "$1" 2>/dev/null && pwd -P) || true; }

# The main checkout, even when this script itself lives in a worktree.
if [ -f "$here/.git" ]; then
  common=$(git -C "$here" rev-parse --git-common-dir 2>/dev/null || true)
  case $common in '' ) common=$here/.git ;; /*) ;; *) common=$here/$common ;; esac
  main=$(canon "$common/..")
else
  main=$(canon "$here")
fi

target=$(canon "$home")
live=$(canon "$HOME/.config/herdr-app")
is_live=0
[ -n "$target" ] && [ "$target" = "$live" ] && is_live=1

fail=0
ok() { printf 'ok    %s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*"; fail=1; }

[ -d "$home" ] || { bad "no app home at $home"; printf '\nrepair: cd %s && ./install.sh\n' "$main" && exit 1; }

source=$(cat "$home/.herdr-ids-source" 2>/dev/null || true)
if [ "$is_live" -eq 1 ]; then
  # The live home is the one the person is looking at: only main may own it.
  if [ -z "$source" ]; then
    bad "no .herdr-ids-source in $home"
    owner=$main
  elif [ "$(canon "$source")" = "$main" ]; then
    ok "live home is owned by the main checkout"
    owner=$main
  else
    bad "live home is owned by $source, not the main checkout ($main)"
    owner=$(canon "$source")
  fi
else
  owner=$(canon "$source")
  if [ -z "$owner" ]; then
    bad "no .herdr-ids-source in $home"
    owner=$main
  elif [ "$owner" = "$main" ]; then
    ok "scratch home is owned by the main checkout"
  else
    ok "scratch home is owned by $owner (a worktree, as scratch homes are)"
  fi
fi

want=$(cat "$owner/VERSION" 2>/dev/null || echo unknown)
installed=$(cat "$home/.herdr-ids-version" 2>/dev/null || true)
if [ "$installed" = "$want" ]; then
  ok "version $want matches $owner/VERSION"
else
  bad "version is ${installed:-none}, $owner/VERSION is $want"
fi

# Every mod that owner has must be linked to it.
for src in "$owner"/mods/ids-*; do
  [ -d "$src" ] || continue
  name=$(basename "$src")
  dest="$home/mods/$name"
  if [ -L "$dest" ]; then
    at=$(canon "$dest")
    if [ -z "$at" ]; then
      bad "$name is a dangling link"
    elif [ "$at" = "$(canon "$src")" ]; then
      ok "$name links to $owner"
    else
      bad "$name links to $at"
    fi
  elif [ -d "$dest" ]; then
    ok "$name is a copy (not linked)"
  else
    bad "$name is missing from $home/mods"
  fi
done

# A link to a checkout that does not have this mod: a leftover from another one.
for dest in "$home"/mods/ids-*; do
  [ -e "$dest" ] || [ -L "$dest" ] || continue
  name=$(basename "$dest")
  [ -d "$owner/mods/$name" ] && continue
  bad "$name is a leftover this checkout does not have ($(canon "$dest" || true))"
done

for src in "$owner"/layouts/*-ids.json; do
  [ -f "$src" ] || continue
  name=$(basename "$src")
  dest="$home/layouts/$name"
  if [ -L "$dest" ]; then
    at=$(canon "$dest")
    if [ "$at" = "$(canon "$src")" ]; then
      ok "$name links to $owner"
    else
      bad "$name links to ${at:-a dangling path}"
    fi
  elif [ -f "$dest" ]; then
    ok "$name is a copy (not linked)"
  else
    bad "$name is missing from $home/layouts"
  fi
done

# The app loads svg() only from its own home; the glyphs must be real files.
if [ -d "$home/ids-icons" ] && [ -n "$(find "$home/ids-icons" -maxdepth 1 -name '*.svg' 2>/dev/null | head -1)" ]; then
  ok "ids-icons holds the glyph files"
else
  bad "ids-icons is missing or empty"
fi

# The app's own read on the layout it is showing (live home only: a scratch home
# usually belongs to a different app instance).
if [ "$is_live" -eq 1 ] && command -v herdr-app >/dev/null 2>&1; then
  status=$(herdr-app status 2>/dev/null || true)
  case $status in
    *'"errors": []'*) ok "herdr-app reports no layout errors" ;;
    '') bad "herdr-app status returned nothing" ;;
    *) bad "herdr-app reports layout errors: $(printf '%s' "$status" | tr -d '\n' | cut -c1-200)" ;;
  esac
fi

if [ "$fail" -eq 0 ]; then
  if [ "$is_live" -eq 1 ]; then
    printf '\nthe live home runs %s\n' "$main"
  else
    printf '\nscratch home %s is consistent with %s\n' "$target" "$owner"
  fi
  exit 0
fi

if [ "$is_live" -eq 1 ]; then
  cat <<EOF

The live app home is not the main checkout, so Herdr is showing something else
(a worktree, or an older copy). Repair it from the main checkout:

  cd $main && ./install.sh

Then reload the layout, and restore any node a reload dropped:

  herdr-app do layout.switch --name main-ids
  herdr-app do layout.show --id sidebar
EOF
else
  printf '\nrepair: cd %s && HERDR_APP_HOME=%s ./install.sh\n' "$owner" "$target"
fi
exit 1
