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

`scripts/sync.sh` installs this exact build into this machine and any named `hc` machine, switches their layout, and prints the version, layout and mod errors for each:

```sh
./scripts/sync.sh                 # this machine
./scripts/sync.sh holocron        # this machine + holocron
./scripts/sync.sh --all           # every connected machine that has Herdr
```

Output is one line per machine:

```
herdr-ids 1.0.0
local        1.0.0   layout=main-ids errors=[]
holocron     1.0.0   layout=main-ids errors=[]
```

`VERSION` is the build's version; `install.sh` writes it to `<app home>/.herdr-ids-version` so each machine can say what it runs. Machines without Herdr are reported and skipped.

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
git clone https://github.com/justincrich/herdr-ids
cd herdr-ids && ./install.sh
herdr-app do layout.switch --name main-ids
```

Or from an already-synced machine: `./scripts/sync.sh <machine>` carries the files over `hc`, so the target needs no clone.

## Day 2

1. Change a mod.
2. Bump `VERSION`.
3. `./scripts/sync.sh --all`
4. `git commit -am "…" && git push`

Everything else follows from the repo being the single source.

## Publishing notes

This is a layout package: `layouts/`, its `mods/`, `RECIPE.md`, `preview.png`, topic `herdr-layout`. A mod-only package uses `herdr-mod` instead. Either appears on herdr.dev within the hour.

## Notes

- `ids-menu` replaces the terminal right-click menu; it does not merge with Herdr's items.
- These are personal copies of shipped mods. Re-copy `defaults/mods/*/main.js` when Herdr ships menu changes; `RECIPE.md` lists the lines to re-apply.
- `herdr-app check <mod>` validates each mod; `herdr-app status` shows mod errors.
