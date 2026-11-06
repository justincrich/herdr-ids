# Copyable Herdr IDs

Right-click a space, tab, pane, agent, or file in Herdr and copy a self-contained block of IDs that another session can use to find and read it.

![Copyable Herdr IDs](preview.png)

This file is the brief: `mods/` and `layouts/` beside it are one build of it. Rebuild from this file if the shipped copies don't fit your Herdr.

## What you see

- **Copy IDs** is the first item on the space, tab, and pane right-click menus.
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

## Built from

- `layouts/main-ids.json` — a copy of the shipped `main` layout with `terminal_menu: "ids-menu"` and the spaces, agents, tabs and files blocks pointed at the `ids-*` mods.
- `layouts/terminals-ids.json` — the same treatment for the `terminals` layout.
- `mods/ids-menu/` — the context menu. `items()` returns the copy actions; `choose()` calls `cx.write_to_clipboard(...)` and `notify(...)`.
- `mods/ids-agents/` — the Agents sidebar, with a right-click that opens `ids-menu` with `tab: "agent"`.
- `mods/ids-files/` — the Files panel, with a right-click that opens `ids-menu` with `tab: "files"`.
- `mods/ids-spaces/`, `mods/ids-tabs/`, `mods/ids-terminals-bar/` — the shipped sidebar and tab mods with their menu opens repointed to `ids-menu`.
- Data comes from `spaces()`, `panes()`, `agents()`, `terminals()` and `focused()` in the `herdr` module; clipboard and toast come from the view `Context` and `notify()`.

## Watch out

- `ids-menu` replaces the whole terminal menu; it does not merge with Herdr's items. A menu item added in a later release will not appear until you copy it in.
- These are personal copies of shipped code. When Herdr ships menu or sidebar changes, re-copy `defaults/mods/*/main.js` and re-apply the right-click lines.
- The payload for a space with many terminals is long; that is deliberate, so a reader with no context can act on it.
- `clipboard_write` in settings.json gates programs writing the clipboard, not a mod.

## Done when

- `herdr-app check <home>/mods/ids-menu` passes, and so does each other `ids-*` mod.
- Right-clicking a space shows **Copy IDs** first; pasting yields a block with the space id and an `hc read … --lines 200` line.
- Right-clicking an agent row opens a popup with **Copy IDs**, **Copy terminal address**, and, when reported, **Copy agent session**.
- Right-clicking a file shows **Copy path** and **Copy relative path**.
- `herdr-app status` reports no mod errors.
