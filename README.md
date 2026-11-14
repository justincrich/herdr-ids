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

## Deploy to laptop and Holocron

Read [DEPLOYMENT.md](./DEPLOYMENT.md) for the shared release contract. Changes
that reach main publish this package's exact commit to the laptop catalog.
It combines that version with the accepted Chief of Staff version, then delivers
both through `hc`. Offline publishers and clients retry automatically. Client
development checkouts stay untouched.

```sh
./scripts/verify.sh
./bootstrap.sh laptop              # from this existing publishing clone
./scripts/sync.sh --status
./scripts/sync.sh --verify
```

Use `bootstrap.sh holocron` on Holocron. Both screens attach to one laptop Chief
of Staff session. Worktree commits never deploy. Completion requires main landing
and verified delivery on both screens; see DEPLOYMENT.md for rollback and evidence.

For scratch development only: `HERDR_APP_HOME=<scratch-home> ./install.sh`.
Use an isolated `HC_SESSION` for native tests.

## What is in here

| Path | Purpose |
|---|---|
| `mods/ids-menu` | the copy menus (IDs, path, path (relative)) |
| `mods/ids-agents` | Agents sidebar with the right-click menu |
| `mods/ids-files` | Files panel: right-click menu, a glyph per file kind, and an open/selected state |
| `mods/ids-spaces`, `mods/ids-tabs`, `mods/ids-terminals-bar` | shipped panels repointed at `ids-menu` |
| `mods/ids-sidebar` | the Spaces/Agents tab strip: both lists in one sidebar panel, switched by tabs |
| `mods/ids-workspace-chrome` | the brand row: Search, Settings gear, and the sidebar toggle, all in the top-left |
| `mods/ids-pane`, `mods/ids-terminals-pane` | pane headers that show the name you gave a pane |
| `mods/ids-rename` | the rename dialog a pane name is typed into |
| `layouts/main-ids.json` | `main` layout wired to the `ids-*` mods |
| `layouts/terminals-ids.json` | `terminals` layout wired the same way |
| `bootstrap.sh` | install hooks, initialize identity, install the retry service |
| `scripts/sync.sh` | publish committed main; inspect, verify or roll back delivery |
| `RECIPE.md` | the brief another agent can rebuild from |
| `preview.png` | screenshot |

## Publishing notes

This is a layout package: `layouts/`, its `mods/`, `RECIPE.md`, `preview.png`, topic `herdr-layout`. A mod-only package uses `herdr-mod` instead. Either appears on herdr.dev within the hour.

## Notes

- `ids-menu` replaces the terminal right-click menu; it does not merge with Herdr's items.
- These are personal copies of shipped mods. Re-copy `defaults/mods/*/main.js` when Herdr ships menu changes; `RECIPE.md` lists the lines to re-apply.
- `herdr-app check <mod>` validates each mod; `herdr-app status` shows mod errors.
