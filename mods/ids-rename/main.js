// Names one pane. Opened as a dialog with props { pane, current }, from the
// pane menu, the pane header's pen button, or a double-click on its name.
// Enter saves, Esc cancels. An empty name gives the pane the program's own
// title back. Names are shared, so every window and every copy shows them.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme, panes, shared, setShared, notify } from "herdr";

const KEY = "ids.paneNames";

// The pane names, as { paneId: name }. Shared and persisted, so a name
// outlives the window that gave it.
function names() {
  const v = shared(KEY);
  return v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {};
}

export default class Rename extends View {
  init(_props, cx) {
    this.text = props()?.current ?? "";
    this.input = InputState.new({ value: this.text });
    if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
    this.input.on("change", (_e, cx) => {
      this.text = this.input.value();
      cx.notify();
    });
    this.input.on("submit", () => this.save());
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => {
      this.inputFocused = true;
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => {
      this.inputFocused = false;
      cx.notify();
    });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  save() {
    const p = props() ?? {};
    const pane = p.pane;
    const name = this.text.trim();
    if (pane) {
      const map = names();
      // Forget panes that are gone, so the map doesn't grow for good.
      const live = new Set(panes().map((x) => x.pane));
      for (const id of Object.keys(map)) if (!live.has(id)) delete map[id];
      if (name) map[pane] = name;
      else delete map[pane];
      setShared(KEY, map);
      notify({
        title: name ? "Pane renamed" : "Pane name cleared",
        body: name || "showing the program's own title",
        level: "success",
      });
    }
    closeOverlay(p.overlay);
  }

  key(e, cx) {
    if (e.key === "escape") {
      closeOverlay(props().overlay);
      cx.stop_propagation();
    }
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const button = (id, text, primary, action) =>
      h_flex()
        .id(id)
        .h(32)
        .px(14)
        .items_center()
        .rounded(8)
        .border_1()
        .border_color(primary ? t.solid : t.input)
        .bg(primary ? t.solid : t.raised)
        .text_color(primary ? t.solid_foreground : t.foreground)
        .text_size(12.5)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.opacity(0.88))
        .on_click(action)
        .child(text);
    return v_flex()
      .id("ids-rename")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .w_full()
      .min_h(0)
      .p(18)
      .bg(t.popover)
      .text_color(t.foreground)
      .child(
        h_flex()
          .items_center()
          .child(div().flex_1().text_size(15).font_semibold().child("Rename pane"))
          .child(div().text_size(11).text_color(t.dim).child("Esc")),
      )
      .child(div().pt(16).pb(7).text_size(11.5).text_color(t.dim).child("Name"))
      .child(
        Input.new(this.input)
          .h(36)
          .px(10)
          .rounded(9)
          .border_1()
          .border_color(this.inputFocused ? t.accent : t.input)
          .bg(t.background)
          .text_size(12.8)
          .text_color(t.foreground),
      )
      .child(div().pt(6).text_size(11.5).text_color(t.dim).child("empty: the program's own title"))
      .child(
        h_flex()
          .pt(20)
          .gap(8)
          .justify_end()
          .child(button("idr-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
          .child(button("idr-save", "Save", true, () => this.save())),
      );
  }
}
