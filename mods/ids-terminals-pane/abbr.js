// The project a folder belongs to, and its short tag.
//
//   projectOf("/Users/j/Projects/herdr-ids/mods/ids-pane") -> "herdr-ids"
//   abbr("herdr-ids") -> "hid"
//
// A pane's header reads "Name Fix [hid]": the name, then the project's tag.
// The tag is derived, never stored, so the same folder always gets the same
// one and renaming a pane doesn't change it.

// Folders under one of these name the project right after them, so a pane
// deep inside a checkout still tags as the checkout.
const ROOTS = ["Projects", "projects", "Code", "code", "src", "repos", "workspace"];

export function projectOf(cwd) {
  if (!cwd) return "";
  const parts = String(cwd).split("/").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    if (ROOTS.includes(parts[i])) return parts[i + 1];
  }
  // Otherwise the folder itself: the last segment, and nothing for a root or a
  // home folder (/Users/j, /tmp/scratch name no project).
  return parts.length > 2 ? parts[parts.length - 1] : "";
}

// Three lowercase letters where the name allows: a one-word name keeps its
// first three (brain -> bra), a two-word name is the first word's initial and
// the second word's first two (herdr-ids -> hid), and a longer name is the
// initials of its first three words (my-cool-app -> mca). Camel case splits
// like a separator, so "herdrIds" tags the same as "herdr-ids".
export function abbr(name) {
  const words = String(name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 3);
  if (words.length === 2) return (words[0][0] + words[1].slice(0, 2)).slice(0, 3);
  return words.slice(0, 3).map((w) => w[0]).join("");
}

// How a program's title reads as a name: it often leads with a spinner frame
// or a status mark, which is not part of the name.
export function cleanTitle(title) {
  return String(title ?? "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

// Whether a title tells you what the program is doing. A folder, a path, the
// program's own name or its key are not names.
export function tells(title, program) {
  const raw = String(title ?? "").trim();
  const live = cleanTitle(raw);
  if (!live) return false;
  if (live === program?.name) return false;
  // A path or a folder, whether or not it leads with a spinner frame.
  if (raw.startsWith("~") || /[/\\]/.test(live) || /^[A-Za-z]:/.test(live)) return false;
  if (live.includes("@")) return false;
  return live.toLowerCase() !== String(program?.key ?? "").toLowerCase();
}

// What a pane's header shows after its name: "[hid]", or "" when the folder
// names no project (a home folder, a temporary folder, no folder at all).
export function tagOf(cwd) {
  const tag = abbr(projectOf(cwd));
  return tag ? `[${tag}]` : "";
}
