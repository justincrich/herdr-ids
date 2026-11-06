# AGENTS.md

How to change this repo and move the change to every device.

## What this is

A Herdr **layout** package: six **mods** and two **layouts**. Herdr calls them that — `mods/<name>/` (small JavaScript programs that draw panels and menus) and `layouts/<name>.json` (the whole window). There is no "plugin" or "addon" in Herdr's vocabulary.

Published at <https://github.com/justincrich/herdr-ids>, topic `herdr-layout`.

## Where the app's own code lives

The app this package plugs into is a separate checkout at **`../herdr-app`** (`~/Projects/herdr-app`, a Rust/GPUI repo with `defaults/mods/` and `src/`). Its runtime and control plane are at `../herdr` (`~/Projects/herdr`).

So when a request is about how Herdr itself behaves — panes, tabs, spaces, dragging, focus, key handling, the mod API, any new `herdr` import — **the base code for that work is `../herdr-app` (or `../herdr`), not this repo.** This repo only ships `mods/ids-*` and `layouts/*-ids.json`; it cannot change app behavior, only replace shipped panels and menus. If a request lands here that needs app-core work, say so and point at `../herdr-app` instead of stretching a mod to fake it.

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
6. Verify the local symlink (below). This is always the last step, and the change is not finished until it passes.

Push before syncing. Devices pull from the repo, so anything unpushed does not reach them, and `sync.sh` warns when the tree is dirty.

```sh
./scripts/sync.sh                 # this device
./scripts/sync.sh holocron        # this device + holocron
./scripts/sync.sh --all           # every connected machine that has Herdr
```

### The last step: verify the local symlink

Always finish a change by proving the local app home runs *this* checkout, not a stale copy. The app executes the files through symlinks, so a missing or broken link means the edit never reached the app.

```sh
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
readlink "$home/mods/ids-menu"          # -> .../Projects/herdr-ids/mods/ids-menu
readlink "$home/layouts/main-ids.json"  # -> .../Projects/herdr-ids/layouts/main-ids.json
cat "$home/.herdr-ids-source"           # this checkout's path
cat "$home/.herdr-ids-version"          # matches ./VERSION
herdr-app status                        # layout=main-ids errors=[]
```

Check every changed `ids-*` mod and `*-ids.json` layout, not just the examples. `readlink` must print a path inside this checkout. If it prints nothing (a copied directory) or points somewhere else, run `./install.sh --link` and check again. Do not report the change done until the links resolve here and `herdr-app status` shows `errors=[]`.

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
| `mods/ids-pane/main.js` | `main`'s pane header: shipped `pane` header + the pane's name, its project tag, a right-click menu |
| `mods/ids-pane/abbr.js` | the project tag (`herdr-ids` → `hid`) and title-as-name helpers; `ids-terminals-pane/abbr.js` is the same file |
| `mods/ids-terminals-pane/main.js` | the same over the shipped `terminals-pane` header |
| `mods/ids-rename/main.js` | the rename dialog that writes a pane's name |
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
- `["Rename pane", "pane.rename", {}]` second in the `pane` case; `choose()` handles it by opening `ids-rename` with `{ pane, current }`
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

**`mods/ids-sidebar/main.js`** (new)
- the stack header that draws one tab per sidebar view; clicking calls `layout.select {stack, child}`
- icons use the app's own assets: `icons/agent.svg` and `mods/workspace-chrome/layers.svg`. A mod's own SVG under a symlinked `mods/ids-*` folder does not resolve in the app home, so keep tab glyphs on app paths
- each tab carries its active view's action: New space on Spaces, the sort popup on Agents; the Agents tab shows the blocked count

**`mods/ids-workspace-chrome/main.js`** (new)
- the brand row: Search, the Settings gear (with an update dot), and the panel-left sidebar toggle
- the shipped footer (Settings + Add machine) is gone; adding a machine lives in Settings → Machines

**`mods/ids-spaces`, `mods/ids-agents`**
- no internal title header: the tab strip above is the only header for the stack
- `ids-spaces` keeps only its machine rows and the New space there action

**`mods/ids-pane/main.js`, `mods/ids-terminals-pane/main.js`** (new)
- a copy of the shipped `pane` / `terminals-pane` header, rendered unchanged except the name
- the label, in order: the pane's own name (`shared("ids.paneNames")`), the name the terminal was started with (`terminals().find(t => t.address === p.terminal)?.name`, which runners set with `hc run --name`), the agent's own title when it tells you what it is doing (`tells`/`cleanTitle` in `abbr.js`), else the shipped program-name logic
- `tagOf(p.cwd)` follows the name in dim text: the project under `Projects/`, abbreviated to three letters (`herdr-ids` → `hid`)
- `rename(p, cx)` opens `ids-rename` with `{ pane, current }`: from a double-click on the name, from a pen button on hover (`mods/workspace-chrome/square-pen.svg`), and from `nextCommand()` for the copy whose pane is `focused()?.pane`
- `menu(p, cx)` opens `ids-menu` (`kind: "popup"`, 236×300, props `{ tab: "pane", target }`) on a right-click anywhere on the header, so the pane menu works there too
- the pane names come from `shared("ids.paneNames")`; `setShared` re-renders every copy, so a rename shows at once

**`mods/ids-rename/main.js`** (new)
- a dialog modeled on the shipped `prompt` mod: `InputState.new`, `.on("change")`, `.on("submit")`, `.focus()`, Esc cancels
- Save writes `shared("ids.paneNames")` with `setShared`: an empty name deletes the entry, and entries for panes that no longer exist are dropped
- mod commands carry no arguments, so the pane id travels in the overlay's `props`, not in `run(...)`

**Layouts**
- root `terminal_menu: "ids-menu"`
- blocks reference `ids-spaces`, `ids-agents`, `ids-tabs`, `ids-files` (and `ids-terminals-bar` in `terminals-ids.json`)
- the pane header is `ids-pane` in `main-ids.json` and `ids-terminals-pane` in `terminals-ids.json`
- the sidebar's `sidebar-lists` is a `stack` with a `header` mod `ids-sidebar`; children are `agents` then `spaces`, `active` picks the default view

## Rebase on a new Herdr release

1. Copy the current `defaults/mods/*/main.js` (and any assets) from the app repo over the matching files here — for the pane headers, over `mods/ids-pane` and `mods/ids-terminals-pane`.
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
