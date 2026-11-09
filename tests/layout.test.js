import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const windowRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(path, "utf8");
function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
test("AC-1 the right-panel control is a 26 by 26 glyph with a selected open state", () => {
  const tabs = read(join(windowRoot, "mods/ids-tabs/main.js"));
  expect(tabs).toContain('.id("panel-toggle")');
  expect(tabs).toContain(".size(26)");
  expect(tabs).toContain("mods/workspace-chrome/panel-right.svg");
  expect(tabs).toContain("t.selected");
  expect(tabs).toContain("t.chrome");
  expect(tabs).not.toContain("Files");
  const open = tabs.indexOf("open ? t.selected : t.chrome");
  expect(open).toBeGreaterThan(-1);
});

test("AC-2 the panel has Files and Chief of Staff, Chief first, and no fixed labels", () => {
  const layout = JSON.parse(read(join(windowRoot, "layouts/main-ids.json")));
  const work = find(layout, "work-body");
  expect(work.children.map((child) => child.id)).toEqual(["main", "panel"]);
  const panel = find(layout, "panel");
  expect(panel.size.px).toBe(368);
  const body = find(layout, "panel-body");
  expect(body.active).toBe("chief");
  expect(body.header.content.mod).toBe("ids-panel");
  expect(body.children.map((child) => child.title)).toEqual(["Files", "Chief of Staff"]);
  const chiefColumn = find(layout, "chief");
  expect(chiefColumn.padding).toBe(0);
  expect(chiefColumn.children.map((child) => child.id)).toEqual(["chief-session"]);
  expect(find(layout, "chief-summary")).toBeNull();
  const glyph = read(join(windowRoot, "mods/ids-files/icons/chief.svg"));
  expect(glyph).toContain("<circle");
  expect(glyph).toContain("M19 21v-2");
  expect(glyph).toContain('stroke-width="2"');
  const panelMod = read(join(windowRoot, "mods/ids-panel/main.js"));
  expect(panelMod).toContain("ids-icons/chief.svg");
  expect(panelMod).toContain("ids-icons/file.svg");
});

test("the committed template uses a name, never a runtime address", () => {
  const layout = JSON.parse(read(join(windowRoot, "layouts/main-ids.json")));
  expect(find(layout, "chief-session").content.terminal).toBe("chief-staff");
});
