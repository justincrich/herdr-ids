// A lazy file browser for the focused pane's folder, with bounded read-only previews.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, openOverlay } from "herdr";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;

// The glyphs in icons/ are copied into the app directory as ids-icons/ by
// install.sh. svg() reads from the app root and refuses a path that resolves
// outside it, and mods/ids-* is a link into this checkout, so the SVGs cannot
// be served from beside this file.
const ICONS = "ids-icons";
// Each kind of file gets its own silhouette rather than a mark inside a file
// outline: at 14px a mark drawn in the 24 box is a blur. Full-size lucide
// shapes stay apart at that size, and the tint tells the families apart faster
// than the outline does.
const TYPE = {
  js: "code", jsx: "code", mjs: "code", cjs: "code", ts: "code", tsx: "code", mts: "code", cts: "code",
  py: "code", pyi: "code", rb: "code", go: "code", rs: "code", java: "code", kt: "code", kts: "code",
  swift: "code", c: "code", h: "code", cc: "code", cpp: "code", hpp: "code", cs: "code", m: "code",
  php: "code", lua: "code", r: "code", scala: "code", clj: "code", cljs: "code", ex: "code", exs: "code",
  hs: "code", ml: "code", mli: "code", dart: "code", zig: "code", nix: "code",
  sh: "terminal", bash: "terminal", zsh: "terminal", fish: "terminal", nu: "terminal", ps1: "terminal", bat: "terminal", cmd: "terminal",
  html: "code-xml", htm: "code-xml", xml: "code-xml", vue: "code-xml", svelte: "code-xml", astro: "code-xml",
  json: "braces", jsonc: "braces", json5: "braces", ndjson: "braces", ipynb: "braces",
  yaml: "sliders-horizontal", yml: "sliders-horizontal", toml: "sliders-horizontal", ini: "sliders-horizontal",
  cfg: "sliders-horizontal", conf: "sliders-horizontal", env: "sliders-horizontal", properties: "sliders-horizontal", plist: "sliders-horizontal",
  css: "hash", scss: "hash", sass: "hash", less: "hash", styl: "hash",
  csv: "table", tsv: "table", xls: "table", xlsx: "table", numbers: "table", parquet: "table",
  sql: "database", db: "database", sqlite: "database", sqlite3: "database", duckdb: "database",
  md: "book-text", mdx: "book-text", markdown: "book-text", rst: "book-text", adoc: "book-text",
  txt: "file-text", text: "file-text", log: "file-text", pdf: "file-text", doc: "file-text", docx: "file-text", rtf: "file-text", pages: "file-text",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", svg: "image",
  ico: "image", bmp: "image", tif: "image", tiff: "image", heic: "image",
  mp3: "audio-lines", wav: "audio-lines", flac: "audio-lines", m4a: "audio-lines", aac: "audio-lines",
  ogg: "audio-lines", opus: "audio-lines", aiff: "audio-lines",
  zip: "archive", tar: "archive", gz: "archive", tgz: "archive", bz2: "archive", xz: "archive",
  zst: "archive", "7z": "archive", rar: "archive", dmg: "archive",
  lock: "lock", lockb: "lock",
};
// A whole name the extension cannot tell apart.
const NAME = {
  ".gitignore": "sliders-horizontal", ".gitattributes": "sliders-horizontal", ".gitmodules": "sliders-horizontal",
  ".npmrc": "sliders-horizontal", ".nvmrc": "sliders-horizontal", ".editorconfig": "sliders-horizontal",
  ".zshrc": "sliders-horizontal", ".bashrc": "sliders-horizontal", ".profile": "sliders-horizontal",
  ".env": "sliders-horizontal", "dockerfile": "sliders-horizontal", "makefile": "sliders-horizontal",
  "cmakelists.txt": "sliders-horizontal", "package-lock.json": "lock", "yarn.lock": "lock",
  "pnpm-lock.yaml": "lock", "bun.lockb": "lock", "cargo.lock": "lock", "gemfile.lock": "lock",
  "poetry.lock": "lock", "uv.lock": "lock", "composer.lock": "lock",
  license: "file-text", licence: "file-text", notice: "file-text",
};
// The colour each family wears, from the theme, so both themes follow.
const TINT = {
  code: "ansi4", terminal: "ansi4", "code-xml": "ansi3", braces: "ansi3", table: "ansi2",
  database: "ansi2", hash: "ansi5", "sliders-horizontal": "ansi5", "book-text": "ansi6",
  image: "ansi1", "audio-lines": "ansi1",
};

function iconFor(name, dir, open) {
  if (dir) return open ? "folder-open" : "folder";
  const lower = name.toLowerCase();
  if (NAME[lower]) return NAME[lower];
  const dot = lower.lastIndexOf(".");
  return (dot > 0 && TYPE[lower.slice(dot + 1)]) || "file";
}
// A selected row asks for the same glyph at a 3 stroke instead of a 2: a stroke
// width is part of the file, so install.sh writes the heavier copy beside it.
const glyph = (icon, bold) => `${ICONS}/${icon}${bold ? "-bold" : ""}.svg`;
const base = path => path.slice(path.lastIndexOf("/") + 1);
const inkOf = (icon, t, fallback = "muted") => (TINT[icon] && t[TINT[icon]]) || t[fallback];

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      const icon = iconFor(entry.name, entry.dir, open), shown = !entry.dir && this.file === path;
      const ink = entry.dir ? (open ? t.foreground : t.muted) : inkOf(icon, t);
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
        .when(shown, el => el.bg(t.selection)).hover(s => s.bg(t.hover))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "ids-menu", kind: "popup", width: 200, props: { tab: "files", target: { path, root: this.root } } }); })
        .child(entry.dir ? svg(glyph(`chevron-${open ? "down" : "right"}`)).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(glyph(icon, shown)).size(14).flex_none().text_color(ink))
        .child(div().flex_1().min_w(0).truncate().when(shown, el => el.font_semibold().text_color(t.foreground)).child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme(), file = this.file, name = file ? base(file) : "", icon = file ? iconFor(name) : null;
    const parent = file?.includes("/") ? file.slice(0, file.lastIndexOf("/")) : null;
    // The tree gives way to the preview, so the header carries the file the tree
    // would have marked: the same glyph in its heavier stroke, the name in semibold.
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).hover(s => s.text_color(t.foreground)).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .when(Boolean(file), el => el.child(svg(glyph(icon, true)).size(14).flex_none().text_color(inkOf(icon, t, "foreground"))))
        .when(Boolean(file), el => el.child(div().flex_1().min_w(0).truncate().font_semibold().child(name)))
        .when(!file, el => el.child(div().font_semibold().child("Files")))
        .when(!file, el => el.child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.root?.split(/[\\/]/).pop() ?? "")))
        .when(Boolean(parent), el => el.child(div().flex_none().max_w(120).truncate().text_size(12).text_color(t.dim).child(parent))))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")));
  }
}
