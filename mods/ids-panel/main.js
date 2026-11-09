// Files and Chief of Staff. The built-in stack header cannot draw the chief
// glyph, so this strip does. Icons are the copies install.sh puts in ids-icons.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, props, run, theme } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const ICONS = {
  files: "ids-icons/file.svg",
  chief: "ids-icons/chief.svg",
};

export default class PanelTabs extends View {
  render() {
    const t = theme();
    const stack = props()?.stack ?? "panel-body";
    const node = find(layout(), stack);
    const children = node?.children ?? [];
    if (!children.length) return div().size_full();
    const active = children.some((child) => child.id === node.active) ? node.active : children[0].id;
    const tab = (child) => {
      const on = child.id === active;
      const icon = ICONS[child.id];
      return h_flex()
        .id(`panel-tab-${child.id}`)
        .h(26)
        .px(9)
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
        .hover((style) => style.bg(on ? t.raised : t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .on_click((_event, cx) => {
          if (!on) run("layout.select", { stack, child: child.id });
          cx.notify();
        })
        .when(Boolean(icon), (el) => el.child(svg(icon).size(14).flex_none()))
        .child(div().flex_none().child(child.title ?? child.id));
    };
    return h_flex()
      .size_full()
      .min_w(0)
      .px(9)
      .gap(4)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .children(children.map(tab));
  }
}
