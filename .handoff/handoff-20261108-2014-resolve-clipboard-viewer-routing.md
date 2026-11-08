# HANDOFF — Resolve herdr-core#84 + herdr-app#746: route harness copies to the viewing machine's clipboard

**Written** 2026-11-08T20:14Z by OpenCode / MiMo-V2.6-Pro
**Repo** herdr-ids (this session's checkout) · **Branch** main · **HEAD** d22d7a4
(The actual fix work happens in **herdr-core** and **herdr-app** — see §2 and §8. Neither
fix repo is a child of this one.)
**How to use this**: read §1–§2, run the checks in §4 and §10, then start at §2.
Claims are labeled VERIFIED / CLAIMED / ASSUMED — re-verify anything not VERIFIED
before you rely on it. Raw evidence is in §10.
§4 facts were observed 2026-11-08T20:14Z and include live processes that host the
user's working sessions; re-check them before touching anything.

## 1. Mission

Make copies made by coding agents (codex, opencode, Claude Code, pi) inside
terminals hosted by **herdr-core** land on the clipboard of the machine the person
is viewing from (the "viewer"), not the machine hosting the session (the "host").
**Done** = the change is deployed on the user's two Macs, a copy from each of the
four tools pastes on the viewer, and a resolution comment is posted on
herdrdev/herdr-core#84 and herdrdev/herdr-app#746 (closing the latter).

**Out of scope**: the user's herdr-ids mods/layouts (an adversarially challenged
investigation proved a mod cannot observe or intercept a program's clipboard
write); `herdrdev/herdr` (the 0.9.x "terminal workspace manager" TUI — a different
product that is installed on the machines but is NOT in this bug's path); upstream
pull requests (this GitHub account is not in herdrdev's `.github/APPROVED_CONTRIBUTORS`;
upstream receives factual comments only).

## 2. Start Here

1. Read the trackers end to end, comments included:
   `gh issue view 84 --repo herdrdev/herdr-core --comments`
   `gh issue view 746 --repo herdrdev/herdr-app --comments`
   (#84 already contains two verified workaround reports and a compatibility-gap
   analysis. It is the issue to resolve.)
2. Get the runtime source — the user has **no checkout of it** (VERIFIED):
   `gh repo fork herdrdev/herdr-core --clone`
   then read the terminal environment setup at `crates/herdr-core/src/api/run.rs`
   (around lines 211–224: it supplies `HC_TERMINAL_ID` / `HC_TERMINAL_SOCKET`).
3. Choose the fix per #84's "Ask": give programs a remote-viewer marker in the
   terminal environment (e.g. `HERDR_REMOTE_VIEWER=1`, or the `HERDR_ENV=1`
   compatibility marker codex already detects), and/or make `terminal.copy`
   write the viewer's clipboard. A third use case is in #84's comments:
   naming **which** viewer (e.g. `HC_VIEWER=<machine>`).
4. Prove the fix with the probe suite in §9 before deploying; deploy to the fleet
   (both Macs); then post resolution comments on both issues.

## 3. State of Play

- Sessions on both Macs are hosted by **herdr-core**, not by `herdr` 0.9.x —
  `VERIFIED` 2026-11-08: process tree `herdr-core serve` → `herdr-core hold` → shell →
  the coding-agent session (command in §10).
- Fleet versions — `VERIFIED` 2026-11-08 via `--version` on both machines:
  host MacBook macOS 26.4.1 arm64 and viewer Mac ("holocron") macOS 15.7.9 arm64 both
  run herdr-core 0.1.18 + herdr-app 0.1.13 (`herdr` 0.9.5 is also installed; unused here).
- Mods cannot fix this — `VERIFIED`: the mod capability surface is
  `clipboard_read` / `clipboard_write` booleans only, with no clipboard
  event/subscription (herdr-app/src/mods.rs:1134-1142).
- Filed **herdrdev/herdr-app#746** (macOS symptom) and posted a reproduction comment on
  **herdrdev/herdr-core#84** — `VERIFIED`: URLs in §8, posted 2026-11-08 via `gh`.
- Root cause — `CLAIMED` by #84's reporter: herdr-core terminals carry no remote
  marker, so programs fall back to `pbcopy` on the host (pi's `isRemoteSession`
  checks `SSH_CONNECTION`/`SSH_CLIENT`/`MOSH_CONNECTION`/`PI_CLIPBOARD_OSC52`).
  Check: `ps eww <agent-pid>` on the host and look for `SSH_*` / `HERDR_ENV`.
- Codex specifically detects Herdr via `HERDR_ENV=1` (not `HC_TERMINAL_ID`) —
  `CLAIMED` by comment on #84, with a **verified** workaround
  (`HERDR_ENV=1 codex resume --last`) and pointer to codex's
  `codex-rs/tui/src/clipboard_copy.rs` (~L104-106, tag rust-v0.166.0).
  pi's verified workaround: `PI_CLIPBOARD_OSC52=1` in the host shell env.
- herdr-app already writes the viewer's clipboard when OSC 52 arrives in the
  terminal stream — `ASSUMED` from herdr-app/src/vt.rs:394 →
  herdr-app/src/terminal.rs:433-448 (`cx.write_to_clipboard`); NOT yet verified for
  remote-machine streams. Check: `printf '\033]52;c;%s\a' "$(printf PROBE|base64)"`
  in a remote pane, then paste on the viewer.

**Landed**: the issue + the comment (no code anywhere). **In progress**: nothing.
**Broken**: the user's daily flow — every copy from codex/opencode/claude/pi in a
remote session is lost from the viewer's clipboard. Which clipboard receives it is
not yet checked on the user's machines; #84's reporter observed the host's.

## 4. Perishable — Check Before Touching Anything (observed 2026-11-08T20:14Z)

- **Live and not ours to stop**: `herdr-core serve` (pid 50763) and `herdr-core hold`
  (pid 50911) on the host Mac run the user's working sessions — including the
  session any agent will run in. Never stop, signal, or restart them (rule in
  herdr-app/AGENTS.md). Re-check: `ps aux | grep herdr-core | grep -v grep`.
- **Live, ignore**: sandboxed `hc` instances under `/private/tmp/nhe/*` and
  `~/.cache/agent-work/labs/*` (the nerfherdr project's sandboxes).
- **Extra worktree**: herdr-ids has
  `.claude/worktrees/imp-copy-to-interacting-device-1794151158-copy-to-interacting-device`
  (empty, from the scoped investigation run; safe to remove via `git worktree remove`
  when no longer needed). Its branch
  `improvement/imp-copy-to-interacting-device-1794151158-copy-to-interacting-device`
  is equally empty.
- **Uncommitted work**: herdr-ids tree clean except untracked `.claude/` (the
  worktree above) — VERIFIED at 20:14Z. herdr-app fork (master @ 7551ffc) has
  untracked `.claude/` and `.kb-run-sprint/` from other sessions — do not delete
  blindly.

## 5. Decisions — Do Not Undo Without Reading

- **The fix cannot live in the herdr-ids mods/layouts.** Mods can only write and read
  the clipboard; nothing tells a mod that a program copied. The user accepted this
  after a challenge-checked investigation (record: §8).
- **The runtime is herdr-core (`hc`), not `herdrdev/herdr`.** herdr-ids/AGENTS.md says
  "its runtime and control plane are at ../herdr" — that is wrong or stale for this
  stack; herdr-app/AGENTS.md ("a native GPUI client of herdr-core") plus the live
  process tree are authoritative. Do not implement against ~/Projects/herdr.
- **Filing split** (per upstream's issue rules, in herdrdev/herdr/.github/ISSUE_TEMPLATE/bug.yml):
  the core-side report duplicates open #84, so it became a reproduction comment;
  the app-side macOS symptom had no report and follows the tracker's per-OS
  convention (#697 Linux, #717 Windows), so it was filed as #746.
- **Upstream interaction is fenced**: no root-cause or fix dumps in issues/comments
  unless the maintainers' issue agent asks; no PRs from this account. Resolution
  comments state the outcome factually and point at the deployed change.

## 6. Dead Ends & Traps

- **Tried**: scoping the fix to the herdr-ids mod/layout system → dead end; a mod
  cannot intercept a harness's copy. Terminal record kept at the path in §8.
- **Tried**: tracing the seam in ~/Projects/herdr (0.9.x) → the clipboard code there
  (src/server/headless/notifications.rs, src/client/clipboard_forwarding.rs,
  src/selection.rs) belongs to the sibling 0.9.x product. Herdr-core's own
  `crates/herdr-core/src/api/run.rs` is the real seam. Read herdr-core before
  borrowing any 0.9.x design.
- **Trap**: "herdr" names three different things — the herdrdev/herdr 0.9.x TUI repo,
  the herdr-core runtime, and the app's JavaScript mod API module named `herdr`.
  Always say which one you mean.
- **Trap**: clipboard routing differs per harness — pi (SSH_* markers /
  `PI_CLIPBOARD_OSC52`), codex (`HERDR_ENV`), claude code and opencode (mechanism
  not yet identified). Verify all four; a fix that rescues one may not reach the others.

## 7. Blockers

None hard. Two standing constraints: (1) any upstream fix ultimately needs the
maintainer (Can) — this account cannot open PRs on herdrdev repos; (2) the fleet
deployment route (build herdr-core from the fork and install over `~/.local/bin`
on both Macs) should be confirmed with the user before replacing their binaries.

## 8. Map — Pointers, Not Payloads

| What | Where |
|---|---|
| The core issue to resolve | https://github.com/herdrdev/herdr-core/issues/84 |
| Our reproduction comment on it | https://github.com/herdrdev/herdr-core/issues/84#issuecomment-6726521100 |
| The app issue we filed (macOS) | https://github.com/herdrdev/herdr-app/issues/746 |
| Sibling app reports | herdrdev/herdr-app#697 (Linux), #717 (Windows), #221 (mod clipboard event) |
| Verified workarounds (from #84 thread) | `PI_CLIPBOARD_OSC52=1` (pi), `HERDR_ENV=1` (codex) |
| Runtime terminal-env seam | herdr-core `crates/herdr-core/src/api/run.rs` (~L211-224) |
| App OSC 52 → viewer clipboard | herdr-app/src/vt.rs:394, herdr-app/src/terminal.rs:433-448 |
| Why mods can't fix it | herdr-app/src/mods.rs:1134-1142 |
| Scoped investigation record (terminal verdict + evidence) | `~/.config/brain/improvements/imp-copy-to-interacting-device-1794151158.json` |
| Empty worktree/branch from that run | `herdr-ids/.claude/worktrees/imp-copy-to-interacting-device-1794151158-copy-to-interacting-device` |

## 9. Environment & Bootstrap

- herdr-app fork (`~/Projects/herdr-app`, master @ 7551ffc): Test `cargo test`,
  build `cargo build` — both `UNVERIFIED` this session (not run).
- herdr-core: no checkout yet; follow the repo's own CONTRIBUTING/justfile after forking — `UNVERIFIED`.
- Access (names only): `gh` authenticated as `justincrich`; ssh alias `holocron`
  (the viewer Mac) works non-interactively (`BatchMode=yes`).
- Constraints: never stop/signal/restart the running app or cores; test with an
  isolated app home (`HERDR_APP_HOME=/tmp/herdr-test` style). Lowercase conventional
  commits. Upstream PRs go to `master` and only the maintainer merges.
- **Probe suite for "done"** (per harness h in codex, opencode, claude code, pi):
  from the viewer, open a remote session; trigger h's copy action on some text;
  paste on the viewer (must appear). Also check the host clipboard to record where
  the text lands before the fix. Known-good baseline to compare against: rerun with
  `PI_CLIPBOARD_OSC52=1` / `HERDR_ENV=1` set on the host.

## 10. Evidence Appendix

Process tree of the session running this work (2026-11-08):

```
62304 22374 /bin/zsh -c ...
22374 22031 /Users/justinrich/.opencode/bin/opencode serve --service
22031 51423 opencode
51423 50911 /bin/zsh -l
50911 50763 /Users/justinrich/.local/bin/herdr-core hold --socket /Users/justinrich/.local/state/herdr-core/default/default.holder.d5207a7b....
50763     1 /Users/justinrich/.local/bin/herdr-core serve
```

Versions (both machines):

```
host   (macOS 26.4.1 arm64): herdr 0.9.5 · herdr-app 0.1.13 · hc 0.1.18
viewer (macOS 15.7.9 arm64): herdr 0.1.13-era app + hc 0.1.18  (herdr-app 0.1.13, herdr 0.9.5)
```

Git sweep (this repo, 2026-11-08T20:14Z):

```
$ git rev-parse --short HEAD && git branch --show-current && git status --porcelain=v1
d22d7a4
main
?? .claude/
$ git worktree list
/Users/justinrich/Projects/herdr-ids                              d22d7a4 [main]
/Users/justinrich/Projects/herdr-ids/.claude/worktrees/imp-copy-to-interacting-device-1794151158-copy-to-interacting-device  d22d7a4 [improvement/imp-copy-to-interacting-device-1794151158-copy-to-interacting-device]
```

herdr-app fork sweep:

```
7551ffc
master
?? .claude/
?? .kb-run-sprint/
```

Mod capability evidence (why the mod surface is a dead end), herdr-app/src/mods.rs:1134-1142:

```
fn capabilities() -> Capabilities {
    Capabilities::new()
        .read_roots([home()])
        .write_roots([app_dir()])
        .execute(ExecuteGrant::Unrestricted)
        .network(NetworkGrant::Unrestricted)
        .storage(true)
        .clipboard_read(true)
        .clipboard_write(true)
```

External postings made 2026-11-08 (all via `gh`):

```
https://github.com/herdrdev/herdr-app/issues/746
https://github.com/herdrdev/herdr-core/issues/84#issuecomment-6726521100
```