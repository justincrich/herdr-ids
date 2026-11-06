# AGENTS.md

How to change this repo and move the change to every device.

## What this is

A Herdr **layout** package: six **mods** and two **layouts**. Herdr calls them that — `mods/<name>/` (small JavaScript programs that draw panels and menus) and `layouts/<name>.json` (the whole window). There is no "plugin" or "addon" in Herdr's vocabulary.

Published at <https://github.com/justincrich/herdr-ids>, topic `herdr-layout`.

## How it reaches the app

Each device keeps a checkout at `~/Projects/herdr-ids` and **symlinks** it into the Herdr app home. The app runs these files directly; nothing is copied.

```
~/.config/herdr-app/mods/ids-menu      -> ~/Projects/herdr-ids/mods/ids-menu
~/.config/herdr-app/layouts/main-ids.json -> ~/Projects/herdr-ids/layouts/main-ids.json
```

`install.sh --link` makes those links; `install.sh --copy` makes a self-contained copy for a device without the repo. Each app home records what it runs in `.herdr-ids-version` and where it points in `.herdr-ids-source`.

## Make a change

1. Edit a mod or layout in this checkout.
2. Validate: `herdr-app check mods/<name>` for every changed mod.
3. Bump `VERSION` (mod or layout change only; docs alone don't need it).
4. Commit and push.
5. Sync: `./scripts/sync.sh --all` (or name machines).

Push before syncing. Devices pull from the repo, so anything unpushed does not reach them, and `sync.sh` warns when the tree is dirty.

```sh
./scripts/sync.sh                 # this device
./scripts/sync.sh holocron        # this device + holocron
./scripts/sync.sh --all           # every connected machine that has Herdr
```

## The commands

| Command | What it does |
|---|---|
| `./install.sh` | link this checkout into `~/.config/herdr-app` |
| `./install.sh --copy` | copy instead of link |
| `./bootstrap.sh` | clone or pull, link, switch layout |
| `./scripts/sync.sh [machines…]` | pull + link here and on machines, print version/layout/errors |
| `herdr-app check mods/<name>` | load and render one mod once; the pass/fail gate |
| `herdr-app status` | the running window: layout, overlays, mod errors |
| `herdr-app do layout.switch --name main-ids` | apply the layout |

## What is where

| Path | Purpose |
|---|---|
| `mods/ids-menu/main.js` | every copy menu: `Copy IDs`, `Copy path`, `Copy relative path`, agent items |
| `mods/ids-agents/main.js` | Agents sidebar; right-click opens `ids-menu` with `tab: "agent"` |
| `mods/ids-files/main.js` | Files panel; right-click opens `ids-menu` with `tab: "files"` |
| `mods/ids-spaces`, `ids-tabs`, `ids-terminals-bar` | shipped panels whose menu open points at `ids-menu` |
| `layouts/main-ids.json` | `main` layout with `terminal_menu: "ids-menu"` and `ids-*` blocks |
| `layouts/terminals-ids.json` | the same for the `terminals` layout |
| `RECIPE.md` | the brief another agent rebuilds from; keep it true when behavior changes |
| `preview.png` | screenshot used by herdr.dev |

## The hooks that make it work

When re-copying a shipped mod from a new Herdr release, these are the lines to re-apply.

**`mods/ids-menu/main.js`**
- import `notify` from `herdr`
- the `idsText(p)` helper (builds the block from `terminals()`, `panes()`, `spaces()`)
- `["Copy IDs", "copy.ids", {}]` first in the `pane`, `tab`, and `space` cases
- `case "agent"` (Copy IDs, terminal address, agent session) and `case "files"` (copy path, relative path)
- `choose()` handles `copy.ids` and `clipboard.copy` with `cx.write_to_clipboard(...)` plus a toast

**`mods/ids-agents/main.js`**
- import `notify`
- `copyText`, `agentMenu`, `terminalMenu`
- `.on_mouse_down("right", …)` on the sub-agent row, the collapsed row, and the full row

**`mods/ids-files/main.js`**
- import `openOverlay`
- `.on_mouse_down("right", …)` on file rows: `openOverlay({ mod: "ids-menu", … props: { tab: "files", target: { path, root } } })`

**`mods/ids-spaces`, `ids-tabs`, `ids-terminals-bar`**
- `mod: "menu"` becomes `mod: "ids-menu"`

**Layouts**
- root `terminal_menu: "ids-menu"`
- blocks reference `ids-spaces`, `ids-agents`, `ids-tabs`, `ids-files` (and `ids-terminals-bar` in `terminals-ids.json`)

## Rebase on a new Herdr release

1. Copy the current `defaults/mods/*/main.js` (and any assets) from the app repo over the matching files here.
2. Re-apply the hooks above.
3. `herdr-app check` each mod.
4. Bump `VERSION`, commit, push, `./scripts/sync.sh --all`.
5. If a release adds a menu item, add it to `ids-menu` too — this menu replaces Herdr's whole menu, it does not merge.

## Testing

- `herdr-app check mods/<name>` must pass for each changed mod.
- `herdr-app status` must show `"errors": []` and the expected `layout`.
- `herdr-app shot /tmp/x.png` and look at it when a visual change matters.
- Right-click each surface: space, tab, pane, agent row, file row.

Do not test against someone else's running app. For a scratch home: `HERDR_APP_HOME=/tmp/herdr-test ./install.sh` then `HERDR_APP_HOME=/tmp/herdr-test herdr-app check …`.

## Constraints

- Never edit a shipped mod in place in the app home. Herdr replaces shipped mods on start and moves edits to `<name>-edited`; that is why every mod here has an `ids-` name.
- This is a personal package. Upstream `herdrdev/herdr-app` takes **fixes only** for the layouts and mods it ships; features belong in a mod like this one.
- No app-core or herdr-core changes are needed, and none should be added for this feature.
- `gpui-kit.d.ts` and `jsconfig.json` are written by the app into every mod folder; they are gitignored and must not be committed or edited.

## Commit style

Lowercase conventional commits, one line, no co-author lines:

```
fix: keep the agent menu open when the row loses focus
feat: copy relative path from the file panel
docs: explain the symlink install
```
