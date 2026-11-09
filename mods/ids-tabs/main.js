import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, layout, settings, focused } from "herdr";

// How many panes the arrows remember.
const TRAIL = 20;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    // One open/closed value for every space. Missing means open.
    const storedOpen = localStorage.getItem("panelOpen");
    this.panelOpen = storedOpen === null ? true : storedOpen === "true";
    const storedTab = localStorage.getItem("panelTab");
    this.panelTab = storedTab === "files" || storedTab === "chief" ? storedTab : "chief";
    this.trail = [];
    this.at = -1;
  }

  // The panes that took focus, oldest first, and where the person stands in that list; the
  // arrows at the end of the tabs walk it. Not shared(): setShared re-renders every mod.
  // A closed pane must never reach pane.focus, which toasts "no such pane"; dropping it here
  // also makes a dimmed arrow truthful in the frame the pane goes.
  prune() {
    const live = new Set(panes().map(p => p.pane));
    const kept = [];
    let at = -1;
    for (let i = 0; i < this.trail.length; i++) {
      if (!live.has(this.trail[i])) continue;
      kept.push(this.trail[i]);
      if (i <= this.at) at = kept.length - 1;
    }
    this.trail = kept;
    this.at = at;
  }
  // Focus moved somewhere the cursor doesn't point at, so it becomes the end of the trail and
  // anything ahead of it is gone. A focused layout block has no pane to remember: leaving it
  // alone is what keeps it from blocking a step.
  record() {
    const pane = focused()?.pane ?? null;
    if (!pane || pane === this.trail[this.at]) return;
    this.trail = this.trail.slice(0, this.at + 1).concat(pane);
    if (this.trail.length > TRAIL) this.trail.shift();
    this.at = this.trail.length - 1;
  }
  // The redraw after a step records nothing, because the cursor already points at the pane
  // that just took focus. A pane can close between two frames, so step over a dead entry.
  step(direction) {
    this.prune();
    const live = new Set(panes().map(p => p.pane));
    for (let i = this.at + direction; i >= 0 && i < this.trail.length; i += direction) {
      if (!live.has(this.trail[i])) continue;
      this.at = i;
      run("pane.focus", { pane: this.trail[i] });
      return;
    }
  }

  // Open or closed is one choice for the whole window. A space change applies it.
  // It does not keep a separate choice per space.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const open = !panel.hidden;
    const tab = enabled.includes(body?.active) ? body.active : null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id;
      this.pending = null;
      const wantTab = this.panelTab;
      const same = open === this.panelOpen && (!this.panelOpen || tab === wantTab);
      if (first && same) return;
      this.pending = { open: this.panelOpen, tab: wantTab, until: Date.now() + 1000 };
      if (this.panelOpen) {
        run("layout.select", { stack: "panel-body", child: wantTab });
        run("layout.show", { id: "panel" });
      } else {
        run("layout.hide", { id: "panel" });
      }
      return;
    }
    if (this.pending) {
      const landed = open === this.pending.open && (!open || tab === this.pending.tab);
      if (!landed && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (open !== this.panelOpen) {
      this.panelOpen = open;
      localStorage.setItem("panelOpen", String(open));
    }
    if (open && tab && tab !== this.panelTab) {
      this.panelTab = tab;
      localStorage.setItem("panelTab", tab);
    }
  }

  render() {
    const t = theme();
    this.prune();
    this.record();
    const back = this.at > 0;
    const forward = this.at < this.trail.length - 1;
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    // History reads brighter than the row's other buttons because it is the one pair that is
    // often unavailable: muted when it can move, dim when it can't, and a dim one takes no
    // click. Fading it with opacity would put it under the contrast of the row's own hairline.
    const arrow = (id, icon, action, enabled) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(enabled ? t.muted : t.dim)
      .when(enabled, el => el.hover(s => s.bg(t.hover).text_color(t.foreground)).on_click(action))
      .on_mouse_down("left", stop).child(svg(icon).size(14));
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", (e) => {
          const from = this.pressed; this.pressed = null;
          if (from === null || from === i) { run("tab.select", { id: c.id }); return; }
          const w = e?.bounds?.width ?? 0, at = e?.local_position?.x ?? 0;
          // The middle of a tab takes the dragged one's panes; its edges put it there.
          if (w > 0 && at > w / 3 && at < (w * 2) / 3) run("tab.merge", { id: shown[from].id, into: c.id });
          else run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "ids-menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = ["files", "chief"];
    this.syncPanel(space, panel, body, enabled);
    const open = panel && !panel.hidden;
    const toggle = div().id("panel-toggle").size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .bg(open ? t.selected : t.chrome).text_color(open ? t.foreground : t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .tooltip("Toggle panel")
      .on_click(() => {
        if (open) {
          this.panelOpen = false;
          localStorage.setItem("panelOpen", "false");
          run("layout.hide", { id: "panel" });
          return;
        }
        this.panelOpen = true;
        localStorage.setItem("panelOpen", "true");
        run("layout.select", { stack: "panel-body", child: this.panelTab });
        run("layout.show", { id: "panel" });
      }).child(svg("mods/workspace-chrome/panel-right.svg").size(15));
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      // The arrows walk the panes that have taken focus, the way a browser walks pages, from
      // the end of the tabs: the one shelf in the window that never moves. Two pixels apart so
      // they read as one stepper, with 8px of air (5 here + the row's 3) before the new tab.
      .child(h_flex().id("history").flex_none().items_center().gap(2).pr(5)
        .child(arrow("back", "ids-icons/arrow-left.svg", () => this.step(-1), back).tooltip("Back"))
        .child(arrow("forward", "ids-icons/arrow-right.svg", () => this.step(1), forward).tooltip("Forward")))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .child(toggle)
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/ids-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/ids-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/ids-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
