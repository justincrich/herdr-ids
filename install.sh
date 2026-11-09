#!/usr/bin/env sh
# Install the copy-ID Herdr mods into one Herdr app home.
#   ./install.sh                 # symlink this checkout into ~/.config/herdr-app
#   ./install.sh --copy          # copy instead (self-contained, no repo needed)
#   HERDR_APP_HOME=/path ./install.sh
#   ./install.sh --force         # allow a linked worktree into the live home
set -eu
here=$(cd "$(dirname "$0")" && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
version=$(cat "$here/VERSION" 2>/dev/null || echo unknown)
mode=link
force=${HERDR_IDS_FORCE_WORKTREE_INSTALL:-0}
for a in "$@"; do
  case "$a" in
    --link) mode=link ;;
    --copy) mode=copy ;;
    --force) force=1 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done

canon() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"; }
live=$(canon "${HOME}/.config/herdr-app")
target=$(canon "$home")

# A linked worktree is a branch someone is still writing. Pointing the live app
# home at it makes the running Herdr render that branch's mods and layouts
# instead of main's, and a layout reload drops the nodes the branch has not got
# yet — on 2026-11-08 that took the agents/spaces sidebar out of every window.
# Only the main checkout installs into the live home; a worktree tests in a
# scratch one. `--force` is the deliberate exception.
if [ -f "$here/.git" ] && [ "$target" = "$live" ] && [ "$force" != 1 ]; then
  cat >&2 <<EOF
refusing to install a worktree into the live app home

  worktree:  $here
  live home: $target

Herdr would render this branch's mods and layouts instead of main's, and a
layout reload drops the nodes this branch has not got. Test in a scratch home:

  HERDR_APP_HOME=/tmp/herdr-test ./install.sh

Install main from the main checkout:

  cd ~/Projects/herdr-ids && ./install.sh

--force (or HERDR_IDS_FORCE_WORKTREE_INSTALL=1) installs it anyway.
EOF
  exit 3
fi

# Whoever points the live home owns what the person is looking at: say when that
# changes hands.
old=$(cat "$home/.herdr-ids-source" 2>/dev/null || true)
if [ -n "$old" ] && [ "$(canon "$old")" != "$here" ]; then
  echo "note: the live home pointed at $old; it will point at $here"
fi

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

# The app serves svg() from its own directory and refuses a path that resolves
# outside it, so a glyph inside a linked mods/ids-* folder never loads. Copy the
# set in, and write the heavier stroke each selected row asks for: a stroke width
# is part of the file, not something a mod can change at paint time.
icons="$home/ids-icons"
rm -rf "$icons"
mkdir -p "$icons"
for src in "$here"/mods/ids-files/icons/*.svg; do
  [ -f "$src" ] || continue
  name=$(basename "$src")
  cp "$src" "$icons/$name"
  case "$name" in chevron-*) continue ;; esac
  sed 's/stroke-width="2"/stroke-width="3"/' "$src" > "$icons/${name%.svg}-bold.svg"
done
cp "$here/mods/ids-files/icons/LICENSE-Lucide.txt" "$icons/LICENSE-Lucide.txt"

printf '%s\n' "$version" > "$home/.herdr-ids-version"
printf '%s\n' "$here" > "$home/.herdr-ids-source"

echo "installed herdr-ids $version into $home ($mode)"
echo "apply:  HERDR_APP_HOME=$home herdr-app do layout.switch --name main-ids"
