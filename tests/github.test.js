// Real git, in real temporary repositories, against mods/ids-menu/github.js.
// The same isolation tests/test_deploy.py uses: git's local env vars are
// stripped (a hook context must not redirect these repos), and each repo
// carries its own user and an empty hooks folder.
import { expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { page, slug } from "../mods/ids-menu/github.js";

let dir;

// A `git` on PATH under the home folder can be the user's main-branch guard
// shim, which blocks branch operations in any repository that is not a linked
// worktree — including these throwaway fixture repos. The guard protects real
// checkouts, not $TMPDIR, so fixtures talk to the real git: the first one on
// PATH outside the home folder (CI has none inside it, so it resolves to git).
const GIT = (() => {
  const home = process.env.HOME ?? "";
  for (const bin of (process.env.PATH ?? "").split(":")) {
    if (!bin || (home && (bin === home || bin.startsWith(home + "/")))) continue;
    const candidate = join(bin, "git");
    if (existsSync(candidate) && !statSync(candidate).isDirectory() && spawnSync(candidate, ["--version"]).status === 0) return candidate;
  }
  return "git";
})();

const env = (() => {
  const clean = { ...process.env };
  for (const name of spawnSync(GIT, ["rev-parse", "--local-env-vars"], { encoding: "utf8" }).stdout.split("\n")) {
    if (name) delete clean[name];
  }
  return clean;
})();

// A failing git call is a broken fixture, not a finding: it throws here.
const ok = (args, cwd) => {
  const r = spawnSync(GIT, args, { cwd, encoding: "utf8", env });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return { code: r.status, stdout: r.stdout };
};

// The runner page() takes in the mod: (args, cwd) -> { code, stdout }.
const git = (args, cwd) => Promise.resolve(ok(args, cwd));

function repo(name) {
  const root = join(dir, name);
  mkdirSync(root, { recursive: true });
  ok(["init", "-b", "main"], root);
  ok(["config", "user.email", "test@example.invalid"], root);
  ok(["config", "user.name", "GitHub test"], root);
  ok(["config", "core.hooksPath", join(dir, "empty-hooks")], root);
  return root;
}

let work;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "herdr-github-test-"));
  mkdirSync(join(dir, "empty-hooks"), { recursive: true });
  // A real origin, pushed to over the filesystem, whose configured URL then
  // names GitHub: page() reads the raw config value, so nothing is fetched.
  const bare = join(dir, "origin.git");
  ok(["init", "--bare", "-b", "main", bare], dir);
  work = repo("work");
  writeFileSync(join(work, "README.md"), "readme\n");
  mkdirSync(join(work, "docs"));
  writeFileSync(join(work, "docs", "guide.md"), "guide\n");
  ok(["add", "."], work);
  ok(["commit", "-m", "first"], work);
  ok(["remote", "add", "origin", bare], work);
  ok(["push", "-u", "origin", "main"], work);
  ok(["push", "origin", "main:feat/one"], work);
  ok(["remote", "set-url", "origin", "https://github.com/o/r.git"], work);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("slug reads every remote shape and keeps no token", () => {
  expect(slug("git@github.com:o/r.git")).toBe("o/r");
  expect(slug("ssh://git@github.com/o/r.git")).toBe("o/r");
  expect(slug("https://github.com/o/r")).toBe("o/r");
  expect(slug("https://github.com/o/r.git")).toBe("o/r");
  const tokened = slug("https://x-access-token:ghp_secret@github.com/o/r.git");
  expect(tokened).toBe("o/r");
  expect(tokened).not.toContain("ghp_secret");
  expect(slug("git@gitlab.com:o/r.git")).toBeNull();
  expect(slug("https://bitbucket.org/o/r.git")).toBeNull();
  expect(slug("ssh://git@github.com:2222/o/r.git")).toBeNull();
});

test("a file and a folder on a pushed branch get their page", async () => {
  expect(await page(git, { root: work, path: "README.md", dir: false })).toBe("https://github.com/o/r/blob/main/README.md");
  expect(await page(git, { root: work, path: "docs", dir: true })).toBe("https://github.com/o/r/tree/main/docs");
});

test("the path is measured from the repo root, and a slashed branch works", async () => {
  expect(await page(git, { root: join(work, "docs"), path: "guide.md", dir: false })).toBe("https://github.com/o/r/blob/main/docs/guide.md");
  ok(["checkout", "feat/one"], work);
  expect(await page(git, { root: work, path: "README.md", dir: false })).toBe("https://github.com/o/r/blob/feat/one/README.md");
  ok(["checkout", "main"], work);
});

test("no page when GitHub cannot have it", async () => {
  // Untracked path.
  expect(await page(git, { root: work, path: "nope.md", dir: false })).toBeNull();
  // Branch never pushed: origin/local-only does not exist.
  ok(["checkout", "-b", "local-only"], work);
  expect(await page(git, { root: work, path: "README.md", dir: false })).toBeNull();
  ok(["checkout", "main"], work);
  // Detached HEAD.
  ok(["checkout", "--detach"], work);
  expect(await page(git, { root: work, path: "README.md", dir: false })).toBeNull();
  ok(["checkout", "main"], work);
  // Origin not on GitHub.
  ok(["remote", "set-url", "origin", "https://gitlab.com/o/r.git"], work);
  expect(await page(git, { root: work, path: "README.md", dir: false })).toBeNull();
  ok(["remote", "set-url", "origin", "https://github.com/o/r.git"], work);
});
