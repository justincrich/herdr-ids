// The window's own chrome: the brand row across the top of the sidebar.
// Herdr's copy puts Settings and Add machine in a sidebar footer; here Settings
// is a gear beside the search and panel buttons, so the footer can go and the
// lists get the space. Adding a machine lives in Settings → Machines.

import { View, div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, window, shared, setShared, updates, layout, focused, panes } from "herdr";

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

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export default class WorkspaceChrome extends View {
  // Panes that have taken focus, oldest first, and where the person stands in that list.
  // Not shared(): setShared re-renders every mod in the window, and this is one panel's memory.
  init() {
    this.trail = [];
    this.at = -1;
  }
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
  // A disabled button still stops its press, or the press starts dragging the window, but it
  // carries no hover and no click: a dim arrow must be inert, not merely grey.
  button(id, label, action, enabled = true) {
    const t = theme();
    return div().id(id).relative().size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(enabled ? t.muted : t.dim)
      .when(enabled, el => el.hover(s => s.bg(t.hover).text_color(t.foreground)).on_click(action))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    const update = updates().app.ready;
    this.prune();
    this.record();
    const back = this.at > 0;
    const forward = this.at < this.trail.length - 1;
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("frame/welcome/herdr.png").size(20).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/workspace-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // The arrows walk the panes that have taken focus, the way a browser walks pages.
      .when(!collapsed, el => el.child(this.button("back", svg("mods/workspace-chrome/chevron-left.svg").size(15), () => this.step(-1), back).tooltip("Back")))
      .when(!collapsed, el => el.child(this.button("forward", svg("mods/workspace-chrome/chevron-right.svg").size(15), () => this.step(1), forward).tooltip("Forward")))
      // A ready update is a dot on the gear, the way it sat on the footer's Settings.
      .when(!collapsed, el => el.child(this.button("settings", svg("mods/workspace-chrome/settings.svg").size(15), () => run("app.settings"))
        .tooltip("Settings")
        .when(Boolean(update), el => el.child(div().absolute().top(4).right(4).size(6).rounded_full().bg(t.accent)))))
      // On the macOS rail the traffic lights fill the row; the sidebar tabs' button unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/workspace-chrome/panel-left.svg").size(15), toggleSidebar).tooltip("Toggle sidebar")));
  }
}
