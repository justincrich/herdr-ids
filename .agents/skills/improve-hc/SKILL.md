---
name: improve-hc
description: "Tweak a mods/ids-* folder or a layouts/*-ids.json in the herdr-ids repo and redeploy the change to every registered client (laptop and holocron). Use when the owner asks to change, rename, restyle, add, or remove a panel, menu, glyph, tab, or layout block in Herdr and wants it live on all devices. Not for app-core changes (those go to ../herdr-app or ../herdr), not for rebasing on a new Herdr release, and not for editing the shared deployment engine."
---

# /improve-hc

## OPERATOR CARD — start here, act, and stop reading

**You do not need to read this file to start.** Read this card, run step 1, act on what it
returns. Everything below the card is REFERENCE — open it for the step you are on.

**Scope stop.** This skill tweaks `mods/ids-*` and `layouts/*-ids.json` only. A request that
needs a new `herdr` import, a new event, or any behavior the app itself must have belongs in
`../herdr-app` or `../herdr` — stop and tell the user so. A rebase on a new Herdr release is
`RECIPE.md`'s procedure, not a tweak. A change to the shared deployment engine (the Python
script both repos ship) needs both repos' copies updated in one coordinated change — stop and
say so.

```bash
# 1. Read the contracts you are about to change (short; read both).
cat DEPLOYMENT.md RECIPE.md
```

```bash
# 2. Isolate the tweak in a worktree. Never edit the primary checkout.
git worktree add .claude/worktrees/improve-hc-$(date +%s) -b improve-hc/$(date +%s)
cd <that worktree>
```

```bash
# 3. Make the described tweak. Bump VERSION. Keep the change small.
#    Then run the three release gates in order. Exact commands:
#      ./scripts/check-mod.sh mods/ids-<changed>
#      herdr-app status
#      ./scripts/verify.sh
#    Any failure is a stop, not a warning.
herdr-app status
```

```bash
# 4. Run the native suite when the change touches a runtime-loading mod or a
#    layout the window rebuilds from. Exact command:
#      python3 ../chief-of-staff/integration/native_verify.py \
#        --ids "$PWD" --evidence "${SCRATCH_ROOT:-/tmp}/herdr-native-evidence"
#    Name the result: PASS, FAIL, or SKIPPED with the reason.
```

```bash
# 5. Open the PR, land it on main. The post-commit hook publishes.
#    This is the one-way door. Do not bypass hooks. Do not push to main directly.
```

```bash
# 6. Publish, then verify delivery to every registered client. Exact commands:
#      ./scripts/sync.sh --status
#      ./scripts/sync.sh --verify
#    Read ~/.local/state/herdr-deploy/receipts/ for each client's receipt.
```

```bash
# 7. Screenshot each client and report. "Deployed" means receipts + a
#    screenshot of the live window on each client, not a green commit.
herdr-app shot /tmp/<client>.png
```

**Rules that override anything you infer:**
1. Scope is a tweak to `mods/ids-*` or `layouts/*-ids.json`. Anything else stops above.
2. `VERSION` must bump. A missing bump means a client sees "same version" and skips the update.
3. A gate that fails is a stop. Never report "done" over a red check, a red portable suite, or a failed client verification.
4. "Deployed" is receipts on every registered client plus a screenshot of the live window on each. A green commit is not deployment proof. A green portable suite is not deployment proof.
5. The `post-commit` hook publishes `main` automatically. Do not bypass it. Do not push to `main` directly. Land through a PR.

<!-- END OPERATOR CARD -->

## Algorithm

1. **Confirm scope.** A tweak is a change to behavior this repo owns: a panel, a menu item, a
   glyph, a tab, a layout block. The base code for anything else — a new `herdr` API, a new
   event, a change to how the app lays out or focuses — lives in `../herdr-app` or `../herdr`.
   *Why:* this repo only ships `mods/ids-*` and `layouts/*-ids.json`. It cannot change app
   behavior. Stretching a mod to fake an app feature produces a mod that breaks on the next
   app release. Say so and stop.

2. **Read the contracts.** `DEPLOYMENT.md` is the release contract; `RECIPE.md` is the brief
   that says what each mod does and how to know it is done. Read both before touching a mod.
   *Why:* the tweaks that look smallest — a renamed menu item, a new glyph — are exactly the
   ones that collide with `RECIPE.md`'s "Done when" checks and `DEPLOYMENT.md`'s delivery
   contract. Reading first is cheaper than fixing after.

3. **Isolate in a worktree.** `git worktree add` from the primary checkout. Never edit the
   primary checkout and never `git switch -c` in it.
   *Why:* other sessions share the primary checkout. Moving its HEAD moves their files out
   from under them. `install.sh` refuses to point the live app home at a worktree for the same
   reason — a branch still being written would replace the fleet's window with a half-built one.

4. **Make the tweak.** Keep it small — one described change per run. Bump `VERSION` (patch
   unless the change is a breaking layout rename).
   *Why:* the deploy catalog keys a release by version+commit. A missing bump means a client
   sees "same version" and skips, and the change never reaches the fleet even though `main`
   moved.

5. **Run the real gates.** In order:
   - `./scripts/check-mod.sh mods/ids-<changed>` — bounded `herdr-app check`. A timeout is a
     failure (a broken mod can leave check running).
   - `herdr-app status` — window and mod errors. `"errors": []` is the bar.
   - `./scripts/verify.sh` — `py_compile`, JSON parse of every layout, `bun test`,
     `unittest discover`. This is what CI runs. It must be green before a PR.
   *Why:* these are the product's own gates, not a parallel checklist. A gate that is not run
   is a claim, not a fact.

6. **Run the native suite when it applies.** **When the native suite is mandatory:** any change
   that touches a mod loaded at runtime, or a layout the window rebuilds from. Run
   `python3 ../chief-of-staff/integration/native_verify.py --ids "$PWD" --evidence …` from
   `../chief-of-staff`. Record the result — PASS, FAIL, or SKIPPED with the reason.
   *Why:* `DEPLOYMENT.md` makes the native suite a mandatory release gate for exactly those
   changes. It is the only check that exercises a real app, a real core, and a real window. If
   `../chief-of-staff` is absent, say so explicitly and never claim the suite passed.

7. **Land through a PR.** Open the PR against `main`. Let CI run `./scripts/verify.sh`. Merge
   when green. Do not push to `main` directly and do not bypass the pre-commit hook.
   *Why:* the `post-commit` hook publishes `main` to the laptop catalog the moment it moves.
   That is the real one-way door — clients activate from it. Bypassing the hook would either
   skip publication or publish unreviewed content.

8. **Publish and verify delivery.** After the merge:
   - `./scripts/sync.sh --status` — the catalog, the queues, and per-client outcomes.
   - `./scripts/sync.sh --verify` — verify both registered clients, from the laptop.
   Read `~/.local/state/herdr-deploy/receipts/` for each client's receipt.
   *Why:* `DEPLOYMENT.md` is explicit: "A successful commit alone proves none of it." The
   receipt is the evidence.

9. **Screenshot each client and report.** `herdr-app shot /tmp/<client>.png` on each client
   (over `hc` for the remote one). If a screenshot cannot be captured, ask the user for one —
   never report "looks good" without an observation. Then emit the output block below.

## Error Handling

| Error | Trigger | Repair |
|---|---|---|
| Scope creep | Request needs a new `herdr` import, a new event, or any app behavior | Stop. Tell the user to open it in `../herdr-app` or `../herdr`. Do not proceed. |
| Shared engine change | Request would edit the deployment engine both repos ship | Stop. Note that `herdr-ids` and `chief-of-staff` carry identical copies and both must change in one coordinated update. |
| Rebase request | Request is "update to a new Herdr release" | Stop. That is `RECIPE.md`'s rebase procedure, not a tweak. |
| Dirty working tree | Unrelated uncommitted changes in the primary checkout | Refuse to mix. Ask the user to commit or stash them first. |
| Leftover worktree | A previous run left a worktree or branch behind | Report it and ask whether to reuse or discard. Never delete unseen work. |
| `check-mod.sh` fails or times out | `herdr-app check` exits non-zero or hangs | A timeout is a failure — treat it as one. First rule out the session: re-run the same gate on the host through `hc exec 'cd <worktree> && ./scripts/check-mod.sh mods/ids-<changed>'`. A sandboxed harness session can hang `herdr-app check` while the host passes it. Then rule out the change: run it against the unmodified mod from `main`. Identical failure there means the gate itself is broken, not the change. Report that clearly and stop. Do not waive the gate on your own. |
| Gate broken on this machine | `herdr-app check` fails identically on the unmodified mod | Report the pre-existing gate failure as the blocker. The skill has no waiver. Ask the user whether to treat it as a known machine-state issue and proceed, or to stop. Either way, never report "done" over it. |
| `herdr-app status` reports errors | `"errors": []` is not the bar | Fix the mod or layout. Do not proceed. |
| `./scripts/verify.sh` fails | Any of `py_compile`, JSON parse, `bun test`, `unittest` red | Fix the cause and rerun. Do not bypass. |
| Native suite red | `native_verify.py` exits non-zero | Fix the cause. Rerun. If `../chief-of-staff` is absent, report the limitation and never claim it passed. |
| Client `failed` in `--verify` | `scripts/sync.sh --verify` reports a failed client | Read `worker.log` and `publication-errors/` in `~/.local/state/herdr-deploy/`. An offline client keeps its current installation and retries automatically. Do not force. |
| `VERSION` not bumped | A run you are resuming landed without a bump | Bump it now and republish. The catalog skipped the previous release. |
| Screenshot cannot be captured | `herdr-app shot` fails on a client | Ask the user for a screenshot. Never report "looks good" without one. |

## Output

```
improve-hc run
  change: <one-line description>
  worktree: <path> (branch <name>)
  gates:
    herdr-app check mods/<name>       PASS
    herdr-app status                  errors: []
    ./scripts/verify.sh               PASS
    native suite                      PASS | SKIPPED (<reason>) | FAIL
  version: 1.6.7 → 1.6.8
  pr: <url> → merged to main at <sha>
  publish: ./scripts/sync.sh --status  release <id>
  delivery:
    laptop    verified  receipt <path>  screenshot <path>
    holocron  verified  receipt <path>  screenshot <path>
  notes: <anything a reader must know>
```
