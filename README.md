# herdr-ids

Copyable IDs for Herdr: right-click a space, tab, pane, agent, or file and copy a block another session can use to find and read it.

Published at **https://github.com/justincrich/herdr-ids** (topic `herdr-layout`).

```
space sp7488… (holden)
  tab tb4c1f…
  terminal t9 · /Users/justinrich/Projects/holden
    agent session ses_e532…
    hc read t9 --lines 200
```

## Install one machine

```sh
./install.sh                                   # this machine
HERDR_APP_HOME=/path/to/home ./install.sh      # another app home
herdr-app do layout.switch --name main-ids
```

Revert any time with `herdr-app do layout.switch --name main`.

## Standardize across devices

Each device keeps its own checkout of this repo at `~/.local/share/herdr-ids` and **pulls** it. `bootstrap.sh` clones on the first run, pulls on later runs, installs, and switches the layout:

```sh
curl -fsSL https://raw.githubusercontent.com/justincrich/herdr-ids/main/bootstrap.sh | sh
```

From any synced machine, `scripts/sync.sh` tells each device to do that pull:

```sh
./scripts/sync.sh                 # this device
./scripts/sync.sh holocron        # this device + holocron
./scripts/sync.sh --all           # every connected machine that has Herdr
```

Output is one line per device:

```
herdr-ids (repo: https://github.com/justincrich/herdr-ids)
local        1.0.0   layout=main-ids errors=[]
holocron     1.0.0   layout=main-ids errors=[]
```

The repo is the source of truth: commit and push before syncing, or remote devices pull the previous push. The script warns when the local tree is dirty. Each device records its build in `<app home>/.herdr-ids-version`; machines without Herdr are reported and skipped.

Bump `VERSION` when you change a mod, then run `sync.sh` again. That is the whole standardization loop: one repo, one command, every machine on the same build.

## What is in here

| Path | Purpose |
|---|---|
| `mods/ids-menu` | the copy menus (IDs, path, relative path) |
| `mods/ids-agents` | Agents sidebar with the right-click menu |
| `mods/ids-files` | Files panel with the right-click menu |
| `mods/ids-spaces`, `mods/ids-tabs`, `mods/ids-terminals-bar` | shipped panels repointed at `ids-menu` |
| `layouts/main-ids.json` | `main` layout wired to the `ids-*` mods |
| `layouts/terminals-ids.json` | `terminals` layout wired the same way |
| `scripts/sync.sh` | install here + named machines, then verify |
| `RECIPE.md` | the brief another agent can rebuild from |
| `preview.png` | screenshot |

## Adding a machine

```sh
curl -fsSL https://raw.githubusercontent.com/justincrich/herdr-ids/main/bootstrap.sh | sh
```

That clones into `~/.local/share/herdr-ids`, installs, and switches the layout. From a synced machine, `./scripts/sync.sh <machine>` runs the same bootstrap there, so the target clones itself.

## Day 2

1. Change a mod.
2. Bump `VERSION`.
3. `git commit -am "…" && git push`
4. `./scripts/sync.sh --all`

Push first: each device pulls from the repo, so a device only gets what is pushed.

## Publishing notes

This is a layout package: `layouts/`, its `mods/`, `RECIPE.md`, `preview.png`, topic `herdr-layout`. A mod-only package uses `herdr-mod` instead. Either appears on herdr.dev within the hour.

## Notes

- `ids-menu` replaces the terminal right-click menu; it does not merge with Herdr's items.
- These are personal copies of shipped mods. Re-copy `defaults/mods/*/main.js` when Herdr ships menu changes; `RECIPE.md` lists the lines to re-apply.
- `herdr-app check <mod>` validates each mod; `herdr-app status` shows mod errors.
