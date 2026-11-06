# herdr-ids

Copyable IDs for Herdr: right-click a space, tab, pane, agent, or file and copy a block another session can use to find and read it.

```
space sp7488… (holden)
  tab tb4c1f…
  terminal t9 · /Users/justinrich/Projects/holden
    agent session ses_e532…
    hc read t9 --lines 200
```

## Install

```sh
./install.sh                                   # this machine
HERDR_APP_HOME=/path/to/home ./install.sh      # another app home
```

Then apply the layout:

```sh
herdr-app do layout.switch --name main-ids
# or, for the Terminals layout:
herdr-app do layout.switch --name terminals-ids
```

Revert any time with `herdr-app do layout.switch --name main`.

### Another machine

```sh
tar czf - mods layouts | hc exec -i --on <machine> sh -c 'cd ~/.config/herdr-app && tar xzf -'
hc exec --on <machine> herdr-app do layout.switch --name main-ids
hc exec --on <machine> herdr-app check ~/.config/herdr-app/mods/ids-menu
```

## What is in here

| Path | Purpose |
|---|---|
| `mods/ids-menu` | the copy menus (IDs, path, relative path) |
| `mods/ids-agents` | Agents sidebar with the right-click menu |
| `mods/ids-files` | Files panel with the right-click menu |
| `mods/ids-spaces`, `mods/ids-tabs`, `mods/ids-terminals-bar` | shipped panels repointed at `ids-menu` |
| `layouts/main-ids.json` | `main` layout wired to the `ids-*` mods |
| `layouts/terminals-ids.json` | `terminals` layout wired the same way |
| `RECIPE.md` | the brief another agent can rebuild from |
| `preview.png` | screenshot |

## Publish it

A layout package is a public GitHub repo with the layout, its mods, `RECIPE.md`, `preview.png`, and the topic `herdr-layout`; mod-only packages use `herdr-mod`. It appears on herdr.dev/layouts (or /mods) within the hour.

```sh
git init && git add -A && git commit -m "copyable herdr ids"
gh repo create <owner>/herdr-ids --public --source=. --push
gh repo edit <owner>/herdr-ids --add-topic herdr-layout
```

## Notes

- `ids-menu` replaces the terminal right-click menu; it does not merge with Herdr's items.
- These are personal copies of shipped mods. Re-copy `defaults/mods/*/main.js` when Herdr ships menu changes.
- `herdr-app check <mod>` validates each mod; `herdr-app status` shows mod errors.
