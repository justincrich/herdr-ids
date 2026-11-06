// Spaces and Agents are two views of one sidebar panel, switched by a tab
// strip instead of sharing the height. The strip is the panel's only header:
// each tab carries its own action, and the Agents tab keeps counting the agents
// that need you even while Spaces is the view in front.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, layout, openOverlay, props, run, shared, theme } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// What each sidebar view is called and drawn as. A child nobody knows (someone
// else's layout) is named by its own title or id. Icons come from the app's own
// icon set: a mod's private folder is symlinked into the app home and its assets
// do not resolve there, so the strip borrows the shipped glyphs instead.
const TABS = {
  agents: { label: "Agents", icon: "icons/agent.svg" },
  spaces: { label: "Spaces", icon: "mods/workspace-chrome/layers.svg" },
};

// The two ways the agents list sorts, so the strip's icon says which is on.
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];

// The sidebar narrows to a rail (76px on macOS, room for the window buttons);
// below about 240px labels and the action crowd the tabs out, so they go icons-only.
const width = () => find(layout(), "sidebar")?.size?.px ?? Infinity;
const rail = () => width() < 160;
const tight = () => width() < 240;

export default class SidebarTabs extends View {
  render() {
    const t = theme();
    const stack = props()?.stack ?? "sidebar-lists";
    const node = find(layout(), stack);
    const children = node?.children ?? [];
    if (!children.length) return div().size_full();
    const active = children.some((c) => c.id === node.active) ? node.active : children[0].id;
    const isRail = rail();
    const labels = !isRail && !tight();
    // Needs you is the only count worth a badge: working already spins its own
    // row, and done turns idle once someone looks at it.
    const blocked = agents().filter((a) => a.status === "blocked").length;
    const working = !blocked && agents().some((a) => a.status === "working");
    const sort = SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];

    const tab = (child) => {
      const meta = TABS[child.id] ?? { label: child.title ?? child.id, icon: null };
      const on = child.id === active;
      return h_flex()
        .id(`sidebar-tab-${child.id}`)
        .h(isRail ? 22 : 26)
        .px(isRail ? 4 : 9)
        .gap(6)
        .flex_none()
        .items_center()
        .rounded(7)
        .border(1)
        .border_color(on ? t.border : t.chrome)
        .bg(on ? t.raised : t.chrome)
        .text_color(on ? t.foreground : t.muted)
        .text_size(12)
        .cursor_pointer()
        .hover((s) => s.bg(on ? t.raised : t.hover).text_color(t.foreground))
        .tooltip(meta.label)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => {
          if (!on) run("layout.select", { stack, child: child.id });
          cx.notify();
        })
        .when(Boolean(meta.icon), (el) => el.child(svg(meta.icon).size(isRail ? 13 : 14).flex_none()))
        .when(labels, (el) => el.child(div().flex_none().child(meta.label)))
        .when(child.id === "agents" && Boolean(blocked), (el) => el.child(
          div().h(16).min_w(16).px(5).rounded(8).flex().items_center().justify_center()
            .bg(t.blocked + "26").text_size(10).font_semibold().text_color(t.blocked)
            .child(String(blocked))))
        .when(child.id === "agents" && working && labels, (el) => el.child(
          svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)));
    };

    const action = (icon, tip, on) => div()
      .id("sidebar-action")
      .size(26)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(6)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(on)
      .child(svg(icon).size(14));

    // A rail has no room for the action row: its one control unfolds the panel
    // again, the way the brand row's panel button does when it is wide.
    const unfold = div()
      .id("sidebar-unfold")
      .size(22)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(6)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip("Expand sidebar")
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("layout.resize", { id: "sidebar", px: shared("sidebar.width") ?? 268 }))
      .child(svg("mods/workspace-chrome/sidebar.svg").size(13));

    return h_flex()
      .size_full()
      .min_w(0)
      .px(isRail ? 3 : 9)
      .gap(isRail ? 2 : 6)
      .items_center()
      .justify_between()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(h_flex().gap(4).items_center().children(children.map(tab)))
      .when(!isRail, (el) => el
        .when(active === "spaces", (el) => el.child(action("mods/workspace-chrome/plus.svg", "New space", () => run("space.new"))))
        .when(active === "agents", (el) => el.child(action(`mods/workspace-chrome/${sort.icon}.svg`, `Sort agents: ${sort.label}`,
          () => openOverlay({ mod: "agents", kind: "popup", width: 200, height: 140, props: { sortMenu: true } })))))
      .when(isRail, (el) => el.child(unfold));
  }
}
