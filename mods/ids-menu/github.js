// The repo a remote URL names on GitHub, as "owner/repo", or null for any
// other host. Only that path is kept: a remote URL can carry a token
// (https://x-access-token:…@github.com/…), which must never reach the
// clipboard or a toast.
export function slug(remote) {
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@\/:]+(?::[^@]*)?@)?(?:www\.)?github\.com[:/](.+?)\/?(?:\.git)?\/?$/i.exec(String(remote).trim());
  const parts = m && m[1].split("/");
  return parts?.length === 2 && parts.every(Boolean) ? parts.join("/") : null;
}

// That page's URL, or null when there is none. `git(args, cwd)` runs git and
// answers { code, stdout }. Nothing is fetched and nothing is written.
export async function page(git, { root, path, dir }) {
  const ask = async (args) => { try { return await git(args, root); } catch { return null; } };
  const out = (r) => (r?.code === 0 ? r.stdout : null);
  const [remote, branch, prefix] = await Promise.all([
    ask(["config", "--get", "remote.origin.url"]),
    ask(["rev-parse", "--abbrev-ref", "HEAD"]),
    ask(["rev-parse", "--show-prefix"]),
  ]);
  const repo = remote && slug(remote.stdout), name = out(branch)?.trim(), under = out(prefix);
  if (!repo || !name || name === "HEAD" || under === null) return null;
  const file = under.trimEnd() + path;
  const there = await ask(["cat-file", "-e", `origin/${name}:${file}`]);
  // Slashes stay, so it reads the way GitHub writes its own links.
  const part = (s) => encodeURIComponent(s).replace(/%2F/gi, "/");
  return there?.code === 0 ? `https://github.com/${repo}/${dir ? "tree" : "blob"}/${part(name)}/${part(file)}` : null;
}
