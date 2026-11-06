# Copyable Herdr IDs

Right-click a space, tab, pane, agent, or file in Herdr and copy a self-contained block of IDs that another session can use to find and read it.

![Copyable Herdr IDs](preview.png)

This file is the brief: `mods/` and `layouts/` beside it are one build of it. Rebuild from this file if the shipped copies don't fit your Herdr.

## What you see

- **Copy IDs** is the first item on the space, tab, and pane right-click menus.
- **Rename pane** is the second item on a pane's right-click menu; double-clicking a pane's name, or the pen button in its header, does the same.
- Right-clicking an agent row in the Agents sidebar opens a popup with **Copy IDs**, **Copy terminal address**, and **Copy agent session** (when the agent reports one).
- Right-clicking a file or folder in the Files panel opens a popup with **Copy path** and **Copy relative path**.
- Each action shows a toast: **IDs copied** for the block, **Copied** for a single value.

## How it behaves

- **Copy IDs** on a space copies the space id and name, its tab ids, and for every terminal in it: the address, its folder, any agent session ids, and the line `hc read <address> --lines 200`.
- On a tab or pane it does the same for that tab or pane instead of the whole space.
- On an agent it starts with `agent <app> · pane … · tab … · space …`, then the terminal block for that agent.
- Remote terminals keep the machine-qualified form, e.g. `box/t7`, so the `hc read` line works from any machine that has the machine added.
- Right-clicking an agent row opens the menu; it does not focus or open the agent.
- Nothing is run and nothing is fetched; the only side effect is the clipboard write.

## Pane names

- A pane can be named. The name replaces the program's own title in that pane's header, and **Copy IDs** on the pane prints it: `pane p2948… (tests) · tab tb471…`.
- Rename from the pane's right-click menu (**Rename pane**), the pen button that appears in the header on hover, or a double-click on the name itself.
- An empty name gives the pane its program's title back.
- Names live in `shared("ids.paneNames")`, a `{ paneId: name }` map the app persists in `shared.json`, so they outlive the window and every open window agrees. Panes are keyed by their own id, so a name never follows a different pane.
- The header is the shipped `pane` (and `terminals-pane`) header with one addition: the name wins over the program name when one is set. Everything else — icon, folder, status, split/zoom/close buttons — is unchanged.
- The rename dialog is its own mod (`ids-rename`): a text field, Save, Cancel, Esc. It writes the map with `setShared`, which re-renders every copy, so the header changes as it saves.
- A keybinding can call `ids-pane:rename` (or `ids-terminals-pane:rename`); the header showing the focused pane opens the dialog.

## Built from

- `layouts/main-ids.json` — a copy of the shipped `main` layout with `terminal_menu: "ids-menu"` and the spaces, agents, tabs and files blocks pointed at the `ids-*` mods.
- `layouts/terminals-ids.json` — the same treatment for the `terminals` layout.
- `mods/ids-menu/` — the context menu. `items()` returns the copy actions; `choose()` calls `cx.write_to_clipboard(...)` and `notify(...)`.
- `mods/ids-agents/` — the Agents sidebar, with a right-click that opens `ids-menu` with `tab: "agent"`.
- `mods/ids-files/` — the Files panel, with a right-click that opens `ids-menu` with `tab: "files"`.
- `mods/ids-spaces/`, `mods/ids-tabs/`, `mods/ids-terminals-bar/` — the shipped sidebar and tab mods with their menu opens repointed to `ids-menu`.
- `mods/ids-sidebar/` — the sidebar's tab strip. It replaces Herdr's split left panel: Spaces and Agents are two views of one stack, so only one list fills the height at a time. The strip is the stack's header: each tab carries its own action (New space on Spaces, Sort agents on Agents) and the Agents tab keeps counting agents that need you while Spaces is in front. It narrows to icons, then to a single unfold button, as the sidebar goes to its rail.
- `mods/ids-workspace-chrome/` — the brand row across the top of the sidebar. Search, the Settings gear, and the sidebar toggle sit together in the top-left; the gear carries an update dot. Add machine moved into Settings → Machines.
- `mods/ids-pane/` — the `main` layout's pane header (a copy of the shipped `pane` mod) with one addition: `shared("ids.paneNames")`'s entry for that pane wins over the program name, and a double-click on the name, or a pen button on hover, opens the rename dialog. `ids-pane:rename` opens it for the focused pane.
- `mods/ids-terminals-pane/` — the same for the `terminals` layout, over the shipped `terminals-pane` header.
- `mods/ids-rename/` — the rename dialog: a text field (an `InputState`), Save, Cancel, Esc. Save writes the name into the same shared map with `setShared`, which persists it and re-renders every mod; an empty name deletes the entry. It also drops entries for panes that no longer exist.
- Data comes from `spaces()`, `panes()`, `agents()`, `terminals()` and `focused()` in the `herdr` module; the pane names come from `shared()`/`setShared()`; clipboard and toast come from the view `Context` and `notify()`.

## Watch out

- `ids-menu` replaces the whole terminal menu; it does not merge with Herdr's items. A menu item added in a later release will not appear until you copy it in.
- Tab glyphs must live in the app's own asset paths (`icons/…`, `mods/workspace-chrome/…`). An SVG inside a symlinked `mods/ids-*` folder does not load in the installed app, so the tab strip renders text-only.
- These are personal copies of shipped code. When Herdr ships menu or sidebar changes, re-copy `defaults/mods/*/main.js` and re-apply the right-click lines.
- Pane names belong to this app home (`shared.json`): another machine's Herdr does not see them. They follow the pane id, so closing a pane drops its name's meaning even before the entry is pruned.
- Naming a pane changes only its header and the ID block; the program's own title, the tab's name, and the agent's name are untouched.
- The payload for a space with many terminals is long; that is deliberate, so a reader with no context can act on it.
- `clipboard_write` in settings.json gates programs writing the clipboard, not a mod.

## Done when

- `herdr-app check <home>/mods/ids-menu` passes, and so does each other `ids-*` mod.
- Right-clicking a space shows **Copy IDs** first; pasting yields a block with the space id and an `hc read … --lines 200` line.
- Right-clicking an agent row opens a popup with **Copy IDs**, **Copy terminal address**, and, when reported, **Copy agent session**.
- Right-clicking a file shows **Copy path** and **Copy relative path**.
- Right-clicking a pane shows **Copy IDs** first and **Rename pane** second; saving a name shows it in that pane's header and in the copied block, and saving an empty one puts the program's title back.
- `herdr-app status` reports no mod errors.
