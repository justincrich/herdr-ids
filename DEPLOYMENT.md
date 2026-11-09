# Herdr package deployment

## Release contract

Both packages use `scripts/sync.sh`. A primary checkout on `main` publishes **only
that repository's HEAD**. Post-commit and post-merge hooks queue the publication
and allow eight seconds for an immediate attempt. Worktrees and other branches
exit before accessing deployment state. A successful commit is not deployment proof.

The laptop serializes publications in `~/.local/state/herdr-deploy/catalog.json`.
It verifies a full Git bundle against the archive, accepts descendants, deduplicates
repeats, ignores superseded ancestors, and rejects divergent histories for source
reconciliation. Updating one package retains the accepted version of the other.
Shallow publishing clones must fetch their full history first.

`clients.json` in that state directory is the explicit client registry: laptop and
Holocron initially. Other connected machines receive nothing unless registered.
Files travel through authenticated `hc exec`, without GitHub access on clients.
Large publications use bounded chunks and a full-payload checksum before execution,
so complete repository histories can exceed hc's single-command input limit.
Neither delivery nor bootstrap pulls, resets, or overwrites development checkouts.

Each client stages verified source archives under `packages/<repo>/<commit>`.
Activation installs their exact owned files into the app home, generates a local
runtime layout from the committed template, and verifies source-derived checksums.
Runtime terminal addresses never enter tracked layouts. Both screens use the
laptop's existing `chief-staff` OpenCode session; Holocron binds `laptop/<address>`.
A different live process with that name is preserved and reported as a failure.
Only the laptop writes its registry quit note.

Activation snapshots the previous owned files and journals the operation before
changing them. It reloads the window without restarting Herdr or its core and
restores the selected workspace, tab, and pane. Open overlays defer activation.
A failed or interrupted activation restores the snapshot. One unavailable or failed
client does not prevent delivery to another. Receipts record both commits, hashes,
terminal binding, prior release, activation result, and observed window status.

User-level workers run at login/startup and every minute. Publishers retain an
outbox until the laptop acknowledges it; the laptop retains each client's desired
release and retries delivery. An offline client keeps its current installation.
`verified`, `pending`, and `failed` describe delivery separately from Git status.

## Setup and operation

Requirements: Python 3.9+, Git with full history, Bun, `hc`, and Herdr app.
The current retry-service installers support macOS LaunchAgents and Linux user
systemd timers. Native release verification is mandatory on each changed platform.

Run bootstrap from each existing publishing clone, using that device's name:

```sh
./bootstrap.sh laptop                 # on laptop, in each repository
./bootstrap.sh holocron               # on Holocron, in each repository
./scripts/sync.sh                     # publish this repository's committed main
./scripts/sync.sh --status            # catalog, queues, and per-client outcomes
./scripts/sync.sh --verify            # verify both registered clients, from laptop
./scripts/sync.sh --verify local      # verify this client's actual installation
./scripts/sync.sh --rollback RELEASE laptop holocron
```

Bootstrap installs versioned copies of the four `.githooks` under the deployment
state directory (pre-commit, pre-push, post-commit, post-merge), preserving the previous hooks. It
initializes the device identity once and installs the shared retry worker.
The publishing hooks invoke that installed engine, so even a dirty or older
checkout can publish committed content without being overwritten.
`scripts/install-hooks.sh <primary-checkout>` installs hooks from a release into
a publishing checkout without changing its tracked files. It
requires an existing checkout and does not clone or pull. For a client that has
no publishing checkout, copy the committed `scripts/deploy.py` through `hc`, then
run its `--init <name>` and `--install-service` commands there. Machine names must
resolve through `hc machine ls`; remote publishers must know the laptop as `laptop`.

Rollback selects a recorded complete commit pair for the explicitly named clients.
It stays pinned until the next accepted publication. It never moves Git branches
or downgrades the catalog. `catalog-releases/`, `receipts/`, `backups/`, and
`recoveries/` retain the evidence. `worker.log` contains retry failures;
`publication-errors/` and `conflicts/` explain rejected publications.

The shared standalone engine is `scripts/deploy.py`, identical in both repositories.
When changing it, update and validate both copies. Verified client activation updates the installed worker for its next tick.
Re-run `--install-service` on publishing-only devices when updating the engine. The low-level installers
(`install.sh` and `scripts/install.mjs`) remain for scratch-home development; they
are not the release path and do not prove fleet delivery.

## Verification and completion

`./scripts/verify.sh` runs portable checks using real Git repositories and files.
CI runs the same command. Pre-commit runs only cheap portable validation; native
window checks and deployment never run before a commit.

Before releasing, run the explicit native integration suite from chief-of-staff:

```sh
python3 integration/native_verify.py --ids /path/to/herdr-ids --evidence "$SCRATCH_ROOT/herdr-native-evidence"
```

Also run `python3 integration/transport_verify.py --evidence <evidence-directory>`
from the laptop to exercise a real Holocron publisher through a disconnected
isolated core, a user-service restart, and automatic retry. This requires the
existing `holocron` and `laptop` SSH/hc aliases. It cleans up only its test service
and isolated core.

The native suite starts an isolated app and core, uses real OpenCode, checks session reuse and
name collisions, rejects an invalid committed mod, recovers an interrupted
activation, and exercises rollback. No native checks are skipped or stubbed on CI:
they are a separate mandatory release gate. Use bounded `scripts/check-mod.sh`
for each changed mod, then inspect fresh screenshots on both clients.

Land through pull requests with `verify` green. Completion requires publications
from **each repository after landing on main**, observed receipts on both clients,
automatic retry/recovery evidence, and screenshots showing the same Chief of Staff
transcript without attach errors. Installed hooks or green portable tests alone
do not complete a deployment.
