#!/usr/bin/env sh
# Install immutable hooks without changing a publishing checkout's files.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
target=${1:-$here}
python3 - "$here" "$target" herdr-ids <<'PYCODE'
import json, os, pathlib, shutil, subprocess, sys, time
source, root = [pathlib.Path(p).resolve() for p in sys.argv[1:3]]
package = sys.argv[3]
state = pathlib.Path(os.environ.get("HERDR_DEPLOY_STATE", str(pathlib.Path.home()/".local/state/herdr-deploy")))
if not (root/".git").is_dir():
    raise SystemExit("install hooks in a primary checkout; linked worktrees inherit them")
engine = state/"worker.py"
if not engine.is_file():
    raise SystemExit("initialize deployment and install the retry service before hooks")
current = subprocess.run(["git", "-C", str(root), "config", "--get", "core.hooksPath"], capture_output=True, text=True).stdout.strip()
hooks = state/"hooks"/package
backup = state/"hook-backups"/package/str(time.time_ns())
backup.mkdir(parents=True)
(backup/"config.json").write_text(json.dumps({"checkout":str(root),"core.hooksPath":current}))
old = pathlib.Path(current) if current else root/".git/hooks"
if not old.is_absolute(): old = root/old
if old.exists(): shutil.copytree(old, backup/"hooks", symlinks=True)
hooks.mkdir(parents=True, exist_ok=True)
for name in ("pre-commit", "pre-push"):
    shutil.copy2(source/".githooks"/name, hooks/name)
import shlex
post = """#!/usr/bin/env sh
set -eu
export PATH="$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:$PATH"
root=$(git rev-parse --show-toplevel)
[ -d "$root/.git" ] || exit 0
[ "$(git branch --show-current)" = main ] || exit 0
exec python3 ENGINE --state STATE --repo PACKAGE --root "$root" --hook
""".replace("ENGINE",shlex.quote(str(engine))).replace("STATE",shlex.quote(str(state))).replace("PACKAGE",shlex.quote(package))
for name in ("post-commit", "post-merge"):
    (hooks/name).write_text(post)
for path in hooks.iterdir(): path.chmod(0o755)
subprocess.run(["git","-C",str(root),"config","core.hooksPath",str(hooks)],check=True)
print(f"installed four hooks for {package} in {hooks}; previous hooks saved in {backup}")
PYCODE
