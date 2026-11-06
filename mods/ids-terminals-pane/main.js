// The Terminals layout's pane header, with a name you can give the pane.
// The shipped `terminals-pane` header shows the program's icon, the
// terminal's title and the folder; this one shows the name you gave the pane
// when there is one. Rename: double-click the name, or the pane menu's
// "Rename pane". Props from the app: { pane, terminal }.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, home, openOverlay, shared, focused, nextCommand } from "herdr";

const KEY = "ids.paneNames";

// The pane names, as { paneId: name }, shared with the rename dialog.
function paneNames() {
  const v = shared(KEY);
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class TerminalsPane extends View {
  init(_props, cx) {
    // "ids-terminals-pane:rename" names the focused pane; the copy showing
    // that pane is the one that asks.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand().catch(() => null);
        if (command === null) return;
        if (command === "rename") {
          const p = this.me();
          if (p && focused()?.pane === p.pane) this.rename(p);
          cx.notify();
        }
      }
    });
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  rename(p, cx) {
    if (cx) cx.stop_propagation();
    openOverlay({ mod: "ids-rename", kind: "dialog", width: 380, props: { pane: p.pane, current: paneNames()[p.pane] ?? "" } });
  }

  button(id, icon, command, args) {
    return div()
      .id(id)
      .p(4)
      .rounded(5)
      .text_color("#5d6168")
      .cursor_pointer()
      .hover((s) => s.bg("#ffffff0d").text_color("#d6d8db"))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(15));
  }

  render() {
    const p = this.me();
    if (!p) return div();
    const pane = p.pane;
    const g = p.program;
    const where = folder(p.cwd);
    const own = paneNames()[pane];
    // Shells often put the folder in their title already.
    const title = own || p.title || "shell";
    const dir = where && !title.includes(where) && !/^[~/]/.test(title) ? where : "";
    return h_flex()
      .id(`tm-head-${pane}`)
      .size_full()
      .pl(12)
      .pr(8)
      .gap(8)
      .items_center()
      .text_size(14)
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(g?.icon), (el) => el.child(g.tint ? svg(g.icon).size(16).flex_none().text_color("#d6d8db") : image(g.icon).w(15).h(15).flex_none()))
      .child(
        div()
          .id(`th-n-${pane}`)
          .flex_none()
          .max_w(320)
          .truncate()
          .font_semibold()
          .text_color(p.focused ? "#e8e9eb" : "#a9adb3")
          .cursor_pointer()
          .on_mouse_down("left", (e, cx) => {
            if (e.click_count === 2) this.rename(p, cx);
          })
          .child(title),
      )
      .child(div().flex_1().truncate().text_color("#8b8f95").child(dir))
      .child(this.button(`th-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
      .child(this.button(`th-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
      .child(this.button(`th-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
      .child(this.button(`th-x-${pane}`, "close", "pane.close", { pane }));
  }
}
