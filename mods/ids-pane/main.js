// A pane's header, with a name you can give it. The shipped `pane` header
// shows the program's icon, the agent's name or the terminal's title, the
// folder, and the agent's status; this one shows the name you gave the pane
// instead, when there is one. Rename: double-click the name, the pen button,
// or the pane menu's "Rename pane". Props from the app: { pane, terminal }.
// Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, openOverlay, shared, focused, nextCommand } from "herdr";

const KEY = "ids.paneNames";

// The pane names, as { paneId: name }, shared with the rename dialog.
function paneNames() {
  const v = shared(KEY);
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init(_props, cx) {
    this.hovered = false;
    // "ids-pane:rename" (or run("ids-pane.rename") from another mod) names the
    // focused pane; the copy showing that pane is the one that asks.
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

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const own = paneNames()[p.pane];
    const name = own || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => {
        this.hovered = hovered;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(
        div()
          .id(`ph-n-${pane}`)
          .flex_none()
          .truncate()
          .max_w(260)
          .font_medium()
          .text_color(t.foreground)
          .on_mouse_down("left", (e, cx) => {
            if (e.click_count === 2) this.rename(p, cx);
          })
          .child(name),
      )
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(st === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", (el) => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", (el) => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, (el) =>
        el
          .child(
            div()
              .id(`ph-rn-${pane}`)
              .p(3)
              .rounded(4)
              .text_color(t.dim)
              .hover((s) => s.bg(t.hover).text_color(t.foreground))
              .on_click((_e, cx) => {
                cx.stop_propagation();
                this.rename(p, cx);
              })
              .child(svg("mods/workspace-chrome/square-pen.svg").size(14)),
          )
          .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
          .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
          .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
          .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })),
      );
  }
}
