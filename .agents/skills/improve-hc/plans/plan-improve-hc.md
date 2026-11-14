# Skill Plan: improve-hc

## Overview
A WORKFLOW skill that takes a small, described tweak to a `herdr-ids` mod or layout, makes the edit in a worktree, validates it against the real release gates, bumps `VERSION`, lands it on `main` through a PR, then drives the existing deployment pipeline (`scripts/sync.sh --verify`) and reports delivery to every registered client. Used by any harness (Claude Code, Codex, OpenCode, Cursor) — the skill is plain Markdown plus shell commands.

## Artifact Classification
**Recommended Type**: SKILL · **Location**: `.agents/skills/improve-hc/SKILL.md` · **Invokable**: yes

**Reasoning**:
- The user wants to run, execute, and redeploy — not read a guide.
- The artifact has ordered steps, side effects (git, `sync.sh`, client activation), and a completion condition.
- It is naturally called as `/improve-hc "tweak"`.

**Why not DOC**:
- It mutates the repo and the deployment catalog. A doc cannot be invoked to do that.

## Scope
**IN**: A small, described change to a `mods/ids-*` folder or a `layouts/*-ids.json` file; the surrounding worktree / PR / merge discipline; the release gates (`herdr-app check`, `scripts/check-mod.sh`, `./scripts/verify.sh`, the native integration suite when named); the publication and delivery pipeline already implemented in `scripts/deploy.py` and `scripts/sync.sh`; and a delivery report naming each client's receipt.

**OUT**: App-core changes (those belong in `../herdr-app` or `../herdr` — the skill must say so and stop). Rebasing this repo on a new Herdr release (that is `RECIPE.md`'s rebase procedure, a different flow). Changing `scripts/deploy.py` itself (requires updating both repos' copies — the skill must say so and stop). Rolling back a published release (`--rollback` is a separate, human-gated operation).

## Purpose
WORKFLOW

## Three-Layer Design

**L1 — Card** (≤60 non-blank lines): The literal first actions, in order. Read `DEPLOYMENT.md` and `RECIPE.md`. Open a worktree. Make the described tweak. Run the bounded gates. Bump `VERSION`. Open a PR. Land it. Publish. Verify delivery to each client. Screenshot both. Report.

**L2 — Code**: None. Every real gate already exists and is invoked by name:
- `./scripts/check-mod.sh mods/<name>` (bounded `herdr-app check`)
- `herdr-app status` (window + mod error check)
- `./scripts/verify.sh` (portable release tests: `py_compile`, JSON parse of layouts, `bun test`, `unittest discover`)
- `python3 integration/native_verify.py` (mandatory native suite, in `../chief-of-staff`)
- `./scripts/sync.sh --status` / `--verify` (the deployment engine's own report)

Per "When to use code", the one-way doors (merging to `main`, publishing to clients) are already enforced externally by the repo's hooks and `deploy.py`. A new script would be a decorative duplicate that drifts. No new code is justified here.

**L3 — Prose**: The judgment that remains, each rule carrying its WHY:
- What counts as a "tweak" vs. a rebase (a tweak is a change to behavior this repo owns; a rebase is re-copying upstream shipped mods and re-applying hooks).
- Why `VERSION` must bump: the deploy catalog keys releases by version+commit; a missing bump means a client sees "same version" and skips.
- When the native integration suite is mandatory: any change that touches a mod that loads at runtime, or any layout the window rebuilds from.
- What "deployed" actually means: `verified` receipts on each registered client plus screenshots of the live window — not a green commit and not a green `verify.sh`.
- How to recover from one failed client: an offline client keeps its current installation; retry automatically; do not force.
- The hard stop: if the tweak needs app-core behavior (a new `herdr` import, a new event), stop and point at `../herdr-app` or `../herdr`. Never stretch a mod to fake app behavior.

## Required Capabilities
- Shell (bash/zsh) — for the existing `scripts/*.sh` and `python3` commands.
- Git — worktree, branch, PR, merge discipline.
- `herdr-app` CLI (present at `~/.local/bin/herdr-app`) — `check`, `status`, `shot`.
- `hc` CLI (present at `~/.local/bin/hc`) — `hc get`, `hc machine ls`, `hc exec` for remote client evidence.
- `python3` (3.9+), `bun` — the repo's `verify.sh` uses both.
- Network/auth to the GitHub remote (for the PR) and to the `laptop` and `holocron` clients over `hc`.

## Harness Compatibility
- **Claude Code**: use Read/Glob/Grep/Write/Edit/Bash; approval via AskUserQuestion.
- **Codex**: use shell/file tools; approval via a plain chat question.
- **OpenCode**: use read/write/shell tools; approval via the question tool.
- **Cursor**: same shell commands; expect sandbox approvals for `hc` calls that reach remote clients and for the GitHub PR.
- **Fallback**: plain chat questions; the skill is plain Markdown and portable shell, so any harness with Bash can run it.

## Existing Artifacts To Leverage
- `DEPLOYMENT.md` (this repo) — the release contract. The skill *points at it*, does not restate it.
- `RECIPE.md` (this repo) — what each mod does and the "Done when" checks. The skill reads the relevant section before touching a mod.
- `AGENTS.md` (this repo) — deployment and validation rules; the skill obeys them.
- `scripts/check-mod.sh`, `scripts/verify.sh`, `scripts/sync.sh`, `scripts/deploy.py`, `bootstrap.sh`, `install.sh` — the real gates. Invoked, never reimplemented.
- `../chief-of-staff/integration/native_verify.py` and `transport_verify.py` — the mandatory native/transport suites, run from that repo.
- `~/.local/state/herdr-deploy/` — the deployment state (`catalog.json`, `clients.json`, `receipts/`, `worker.log`). Read for evidence; never edited by hand.

## DRY Analysis

### Shared Patterns Found
- **"Validate a mod"**: `scripts/check-mod.sh` already wraps `herdr-app check` with a timeout. Recommendation: keep local — call it, do not re-wrap.
- **"Portable release tests"**: `scripts/verify.sh` already runs `py_compile`, JSON parse, `bun test`, `unittest`. Recommendation: keep local — call it.
- **"Report deployment status"**: `scripts/sync.sh --status` / `--verify` already emit the catalog, queues, and per-client outcomes as JSON. Recommendation: keep local — read the output; do not reformat into a parallel report structure.

### Proposed Shared Artifacts
- **New Script**: None. Every gate is already a named command.
- **New Skill**: None. `improve-hc` is the new one.
- **New Doc**: None. `DEPLOYMENT.md` and `RECIPE.md` are the references; the skill links to them.

## Process Algorithm — task items

### T1 — Author `.agents/skills/improve-hc/SKILL.md`
- **Scope / files**: `.agents/skills/improve-hc/SKILL.md` (new)
- **Action**: Write the skill with an Agent-Skills-spec-compliant frontmatter (`name: improve-hc`, `description` YAML double-quoted, ≤1024 chars, naming the trigger situations), an OPERATOR CARD first (≤60 non-blank lines) with the literal command sequence and one exit-code branch, an `## Algorithm` section, an `## Error Handling` table with a runnable `repair` per row, and an `## Output` section showing the delivery report shape.
- **Acceptance criteria**:
  - AC-1: Frontmatter `name` matches the directory `improve-hc`; `description` is ≤1024 chars and names the trigger situations (tweak a mod or layout in this repo and redeploy).
  - AC-2: Card is the first content after the title, ≤60 non-blank lines, and names only commands that exist (`./scripts/verify.sh`, `./scripts/sync.sh`, `herdr-app`, `hc`, `git`).
  - AC-3: Every imperative in `## Algorithm` carries its WHY.
  - AC-4: Every row in `## Error Handling` names a runnable repair.
  - AC-5: The skill explicitly stops and points at `../herdr-app` / `../herdr` for app-core requests.
  - AC-6: The skill explicitly stops and refuses to edit `scripts/deploy.py` without noting both repos' copies must change.
  - AC-FT: A subagent with no prior context, given only `Use the skill at .agents/skills/improve-hc to <realistic tweak>`, reaches the first productive action from the card alone and completes the task without asking what any command means.
  - AC-lint: `bash /Users/justinrich/.config/opencode/skills/skill-plan/scripts/lint-skill-surface.sh .agents/skills/improve-hc` exits 0.
- **Dependencies**: none.
- **Recommended subagent**: none — this is a single-file authoring task; the orchestrator does it directly.

### T2 — Lint and forward-test
- **Scope / files**: `.agents/skills/improve-hc/`
- **Action**: Run the surface lint. Fix every finding verbatim. Then dispatch a `general` subagent with no prior context to attempt a realistic tweak using only the skill, and record whether it reached a productive action from the card alone.
- **Acceptance criteria**: lint exits 0; forward test passes or is explicitly skipped with the reason (time, approvals, or production-touching) named.
- **Dependencies**: T1.

## Edge Cases & Errors
| Category | Case | Handling |
|---|---|---|
| Scope | Request needs app-core behavior (new `herdr` import, new event) | Stop. Point at `../herdr-app` or `../herdr`. Do not stretch a mod. |
| Scope | Request would change `scripts/deploy.py` | Stop. Note that both repos ship identical copies and both must be updated in one change. |
| Scope | Request is a rebase on a new Herdr release | Stop. That is `RECIPE.md`'s rebase procedure, not a tweak. |
| State | Working tree is dirty with unrelated changes | Refuse to mix. Either commit them separately or ask the user to clean up. |
| State | A previous `improve-hc` run left a worktree or branch behind | Report it and ask whether to reuse or discard. Never delete unseen work. |
| Gate | `herdr-app check` times out or fails | Treat as failure (per `scripts/check-mod.sh`'s own comment). Repair the mod; do not proceed. |
| Gate | `./scripts/sync.sh --verify` reports a `failed` client | Read `worker.log` and `publication-errors/`. An offline client keeps its current installation and retries automatically. Do not force. |
| Gate | Native integration suite is required but `../chief-of-staff` is absent | Report the limitation explicitly. Never claim the suite passed. |
| Side effect | The `post-commit` hook auto-publishes on `main` | This is the real one-way door. The skill must name it before landing and must not bypass hooks. |
| Side effect | Two clients, one failed | Per `DEPLOYMENT.md`, one failed client does not block delivery to another. Report each client's outcome separately. |
| Evidence | Screenshot cannot be captured on a client | Ask the user for one. Never report "looks good" without an observation. |

## Output Template
```
improve-hc run
  change: <one-line description>
  worktree: <path> (branch <name>)
  gates:
    herdr-app check mods/<name>       PASS
    herdr-app status                  errors: []
    ./scripts/verify.sh               PASS (bun test, unittest, py_compile, layouts parse)
    native suite                      PASS | SKIPPED (<reason>) | FAIL
  version: 1.6.7 → 1.6.8
  pr: <url> → merged to main at <sha>
  publish: ./scripts/sync.sh --status  release <id>
  delivery:
    laptop    verified  receipt <path>  screenshot <path>
    holocron  verified  receipt <path>  screenshot <path>
  notes: <anything a reader must know>
```

## Examples
```
/improve-hc "rename the 'Copy relative path' menu item to 'Copy path (relative)' in mods/ids-menu"
/improve-hc "make the Files panel show a folder-open glyph for expanded folders (mods/ids-files)"
```
