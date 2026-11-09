#!/usr/bin/env python3
"""Committed Herdr releases, laptop catalog, durable delivery and recovery.

The same standalone engine ships in both repositories. All remote calls use hc.
No development checkout is a client installation destination.
"""

import argparse
import base64
from contextlib import contextmanager
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

PACKAGES = ("chief-of-staff", "herdr-ids")
DEFAULT_CLIENTS = [
    {"name": "laptop", "machine": None},
    {"name": "holocron", "machine": "holocron"},
]
HEX = re.compile(r"^[0-9a-f]{40}$")
NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")


class DeploymentError(RuntimeError):
    def __init__(self, kind, message):
        super().__init__(message)
        self.kind = kind


def git_environment(env=None):
    """Honor explicit repository paths even when invoked by another Git hook."""
    result = dict(os.environ if env is None else env)
    names = (
        subprocess.check_output(
            ["git", "rev-parse", "--local-env-vars"], env=result, timeout=10
        )
        .decode()
        .splitlines()
    )
    for name in names:
        result.pop(name, None)
    return result


def run(argv, *, data=None, timeout=30, env=None):
    if str(argv[0]) == "git":
        env = git_environment(env)
    try:
        p = subprocess.run(
            [str(x) for x in argv],
            input=data,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            env=env,
        )
    except subprocess.TimeoutExpired as error:
        raise DeploymentError(
            "unavailable", f"{argv[0]} timed out after {timeout}s"
        ) from error
    if p.returncode:
        kind = "command_failed"
        if str(argv[0]) == "herdr-app" and argv[1] == "status" and p.returncode == 2:
            kind = "unavailable"
        if str(argv[0]) == "hc":
            try:
                reported = json.loads(p.stderr).get("error", {}).get("kind")
                if reported in (
                    "not_found",
                    "disconnected",
                    "not_connected",
                    "connect_failed",
                    "timeout",
                    "unavailable",
                    "remote_failed",
                ):
                    kind = "unavailable"
            except (ValueError, AttributeError):
                pass
        raise DeploymentError(
            kind,
            f"{argv[0]} exited {p.returncode}: {p.stderr.decode(errors='replace')[-2000:]}",
        )
    return p.stdout


def json_run(argv, **kwargs):
    result = json.loads(run(argv, **kwargs))
    if isinstance(result, dict) and result.get("error"):
        raise DeploymentError("command_failed", json.dumps(result["error"]))
    return result


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path, default=None):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        if default is not None:
            return default
        raise


def write_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
        # Persist the rename before acknowledging a queue/catalog transition.
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def write_json(path, value):
    write_bytes(path, (json.dumps(value, indent=2, sort_keys=True) + "\n").encode())


@contextmanager
def locked(state, name, blocking=True):
    state.mkdir(parents=True, exist_ok=True)
    with (state / (name + ".lock")).open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        yield


def relative(name):
    path = Path(name)
    if not name or path.is_absolute() or ".." in path.parts or str(path) != name:
        raise RuntimeError(f"unsafe relative path: {name!r}")
    return path


def unpack(archive, destination):
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        members = tar.getmembers()
        seen = set()
        for entry in members:
            relative(entry.name.rstrip("/"))
            if entry.name in seen or not (entry.isfile() or entry.isdir()):
                raise RuntimeError(f"unsafe archive entry: {entry.name}")
            seen.add(entry.name)
        for entry in members:
            path = destination / entry.name
            if entry.isdir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                content = tar.extractfile(entry)
                if content is None:
                    raise RuntimeError("archive has no file content")
                path.write_bytes(content.read())
                path.chmod(0o755 if entry.mode & 0o111 else 0o644)


def manifest(archive):
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for entry in tar:
            if entry.isfile():
                content = tar.extractfile(entry)
                if content is None:
                    raise RuntimeError("archive has no file content")
                files[entry.name] = digest(content.read())
    return files


def validate_publication(pub):
    # Versioned wire schema. Validate before any field drives a path or command.
    fields = {
        "schema": int,
        "repo": str,
        "commit": str,
        "archive": str,
        "sha256": str,
        "bundle": str,
        "bundle_sha256": str,
        "files": dict,
    }
    if not isinstance(pub, dict) or set(pub) != set(fields):
        raise RuntimeError("invalid publication schema fields")
    for field, kind in fields.items():
        if type(pub[field]) is not kind:
            raise RuntimeError(f"invalid publication {field}")
    if (
        pub["schema"] != 1
        or pub["repo"] not in PACKAGES
        or not HEX.fullmatch(pub["commit"])
    ):
        raise RuntimeError("invalid publication identity")
    for name, checksum in pub["files"].items():
        relative(name)
        if not isinstance(checksum, str) or not re.fullmatch("[0-9a-f]{64}", checksum):
            raise RuntimeError("invalid file checksum")
    for field, checksum in (("archive", "sha256"), ("bundle", "bundle_sha256")):
        data = base64.b64decode(pub[field], validate=True)
        if digest(data) != pub[checksum]:
            raise RuntimeError(f"{field} checksum mismatch")
    if manifest(base64.b64decode(pub["archive"])) != pub["files"]:
        raise RuntimeError("source manifest checksum mismatch")


def primary(path):
    return (path / ".git").is_dir() and run(
        ["git", "-C", path, "branch", "--show-current"]
    ).strip() == b"main"


def make_publication(root, name):
    if name not in PACKAGES:
        raise RuntimeError("unknown repository")
    if (
        run(["git", "-C", root, "rev-parse", "--is-shallow-repository"]).strip()
        == b"true"
    ):
        raise RuntimeError(
            "publication needs full Git history; fetch --unshallow before publishing"
        )
    commit = run(["git", "-C", root, "rev-parse", "HEAD"]).decode().strip()
    archive = run(["git", "-C", root, "archive", "--format=tar", commit])
    with tempfile.TemporaryDirectory(prefix="herdr-bundle-") as temp:
        bundle = Path(temp) / "source.bundle"
        run(["git", "-C", root, "bundle", "create", bundle, "HEAD"], timeout=60)
        history = bundle.read_bytes()
    pub = {
        "schema": 1,
        "repo": name,
        "commit": commit,
        "archive": base64.b64encode(archive).decode(),
        "sha256": digest(archive),
        "files": manifest(archive),
        "bundle": base64.b64encode(history).decode(),
        "bundle_sha256": digest(history),
    }
    validate_publication(pub)
    return pub


def enqueue(state, pub):
    validate_publication(pub)
    path = state / "outbox" / f"{pub['repo']}-{pub['commit']}.json"
    write_json(path, pub)
    return path


def release_id(packages):
    return digest(
        json.dumps(
            {name: pub["commit"] for name, pub in packages.items()}, sort_keys=True
        ).encode()
    )[:24]


def accept(state, pub):
    validate_publication(pub)
    with locked(state, "catalog"):
        history = state / "history" / pub["repo"]
        if not history.exists():
            run(["git", "init", "--bare", history])
        with tempfile.TemporaryDirectory(prefix="herdr-history-") as temp:
            bundle = Path(temp) / "source.bundle"
            bundle.write_bytes(base64.b64decode(pub["bundle"]))
            run(["git", "-C", history, "bundle", "verify", bundle])
            run(
                [
                    "git",
                    "-C",
                    history,
                    "fetch",
                    "--no-write-fetch-head",
                    "--no-auto-maintenance",
                    bundle,
                    "HEAD",
                ]
            )
            committed = run(
                ["git", "-C", history, "archive", "--format=tar", pub["commit"]]
            )
            if digest(committed) != pub["sha256"]:
                raise RuntimeError("archive does not match Git history checksum")
        catalog = read_json(state / "catalog.json", {"schema": 1, "packages": {}})
        old = catalog["packages"].get(pub["repo"])
        result = "accepted"
        if old:
            if old["commit"] == pub["commit"]:
                result = "duplicate"
            else:

                def ancestor(a, b):
                    check = subprocess.run(
                        [
                            "git",
                            "-C",
                            str(history),
                            "merge-base",
                            "--is-ancestor",
                            a,
                            b,
                        ],
                        capture_output=True,
                        env=git_environment(),
                    )
                    if check.returncode not in (0, 1):
                        raise RuntimeError(check.stderr.decode())
                    return check.returncode == 0

                if ancestor(pub["commit"], old["commit"]):
                    result = "superseded"
                elif not ancestor(old["commit"], pub["commit"]):
                    write_json(
                        state / "conflicts" / f"{pub['repo']}-{pub['commit']}.json", pub
                    )
                    raise DeploymentError(
                        "divergent",
                        f"divergent {pub['repo']}: accepted {old['commit']}, proposed {pub['commit']}; reconcile source history",
                    )
        if result == "accepted":
            path = state / "publications" / pub["repo"] / (pub["commit"] + ".json")
            write_json(path, pub)
            run(
                [
                    "git",
                    "-C",
                    history,
                    "update-ref",
                    "refs/releases/" + pub["commit"],
                    pub["commit"],
                ]
            )
            catalog["packages"][pub["repo"]] = {
                "commit": pub["commit"],
                "sha256": pub["sha256"],
                "path": str(path),
            }
            catalog["release"] = release_id(catalog["packages"])
            catalog["updated"] = time.time()
            write_json(
                state / "catalog-releases" / (catalog["release"] + ".json"), catalog
            )
            write_json(state / "catalog.json", catalog)
        return {
            "result": result,
            "release": catalog["release"],
            "commit": pub["commit"],
        }


def check_files(root, files):
    for name, expected in files.items():
        path = root / relative(name)
        if not path.is_file() or digest(path.read_bytes()) != expected:
            raise RuntimeError(f"file checksum mismatch: {path}")


def stage_package(state, pub):
    validate_publication(pub)
    target = state / "packages" / pub["repo"] / pub["commit"]
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="stage-", dir=target.parent) as temp:
            unpack(base64.b64decode(pub["archive"]), Path(temp))
            check_files(Path(temp), pub["files"])
            os.rename(temp, target)
    check_files(target, pub["files"])
    return target


def find_node(node, name):
    if node.get("id") == name:
        return node
    for child in node.get("children", []):
        found = find_node(child, name)
        if found is not None:
            return found
    return None


def runtime_layout(template, terminal):
    if not re.fullmatch(r"(?:[a-z0-9_-]+/)?t[1-9][0-9a-z]*", terminal):
        raise RuntimeError("invalid terminal address")
    tree = json.loads(template)
    pane = find_node(tree, "chief-session")
    if pane is None:
        raise RuntimeError("layout has no chief-session block")
    pane["content"] = {"terminal": terminal}
    return (json.dumps(tree, indent=2) + "\n").encode()


def client_env(config):
    env = dict(os.environ)
    env["PATH"] = os.pathsep.join(
        [
            str(Path.home() / ".local/bin"),
            str(Path.home() / ".bun/bin"),
            "/opt/homebrew/bin",
            env.get("PATH", ""),
        ]
    )
    for key in (
        "HERDR_APP_HOME",
        "HC_SESSION",
        "HC_SOCKET",
        "XDG_STATE_HOME",
        "XDG_CONFIG_HOME",
        "XDG_RUNTIME_DIR",
    ):
        if key in config.get("environment", {}):
            env[key] = config["environment"][key]
    return env


def app_home(config):
    return Path(
        client_env(config).get("HERDR_APP_HOME", str(Path.home() / ".config/herdr-app"))
    )


def expected_files(state, packages, terminal, project):
    sources = {name: stage_package(state, pub) for name, pub in packages.items()}
    files = {}
    for name, source in sources.items():
        for relative_path in packages[name]["files"]:
            if relative_path.startswith("mods/"):
                files[relative_path] = (source / relative_path).read_bytes()
    ids = sources["herdr-ids"]
    for path in (ids / "layouts").glob("*-ids.json"):
        files[f"layouts/{path.name}"] = (
            runtime_layout(path.read_text(), terminal)
            if path.name == "main-ids.json"
            else path.read_bytes()
        )
    for path in (ids / "mods/ids-files/icons").iterdir():
        if path.suffix == ".svg" or path.name == "LICENSE-Lucide.txt":
            files[f"ids-icons/{path.name}"] = path.read_bytes()
            if path.suffix == ".svg" and not path.name.startswith("chevron-"):
                files[f"ids-icons/{path.stem}-bold.svg"] = path.read_bytes().replace(
                    b'stroke-width="2"', b'stroke-width="3"'
                )
    files[".herdr-ids-version"] = (ids / "VERSION").read_bytes()
    files[".herdr-ids-source"] = (str(ids) + "\n").encode()
    files["data/chief-deploy.json"] = (
        json.dumps({"terminal": terminal, "project": project}) + "\n"
    ).encode()
    return files


def remove(path):
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)


def owned_entries(home, files):
    entries = {
        "layouts/main-ids.json",
        "layouts/terminals-ids.json",
        "ids-icons",
        ".herdr-ids-source",
        ".herdr-ids-version",
        "data/chief-deploy.json",
        "mods/chief-of-staff",
    }
    entries.update(str(p.relative_to(home)) for p in (home / "mods").glob("ids-*"))
    entries.update(
        "/".join(path.split("/")[:2]) for path in files if path.startswith("mods/")
    )
    return sorted(entries)


def snapshot(home, destination, entries):
    saved = {}
    for entry in entries:
        path = home / relative(entry)
        target = destination / entry
        if not path.exists() and not path.is_symlink():
            saved[entry] = {"kind": "absent", "was_link": None}
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        # Capture the actual bytes behind development symlinks, so later edits
        # cannot invalidate the initial migration rollback.
        if path.is_dir():
            shutil.copytree(path, target, symlinks=False)
        else:
            shutil.copy2(path, target, follow_symlinks=True)
        saved[entry] = {
            "kind": "present",
            "was_link": os.readlink(path) if path.is_symlink() else None,
        }
    write_json(destination / "entries.json", saved)


def restore(home, backup):
    for entry, info in read_json(backup / "entries.json").items():
        path = home / relative(entry)
        remove(path)
        if info["kind"] == "present":
            source = backup / entry
            path.parent.mkdir(parents=True, exist_ok=True)
            if source.is_dir():
                shutil.copytree(source, path)
            else:
                shutil.copy2(source, path)


def refresh(config, before):
    env = client_env(config)
    home = app_home(config)
    # A different layout name rebuilds mod and terminal views. It uses the
    # same tree; workspace and terminals are never closed or recreated.
    name = before["layout"]
    temporary = home / "layouts/herdr-deploy-refresh.json"
    source = home / "layouts" / (name + ".json")
    write_bytes(temporary, source.read_bytes())
    try:
        json_run(
            ["herdr-app", "do", "layout.switch", "--name", "herdr-deploy-refresh"],
            env=env,
        )
        json_run(["herdr-app", "do", "layout.switch", "--name", name], env=env)
        for key, command, arg in (
            ("space", "space.select", "id"),
            ("tab", "tab.select", "id"),
            ("focused_pane", "pane.focus", "pane"),
        ):
            if before.get(key):
                json_run(["herdr-app", "do", command, "--" + arg, before[key]], env=env)
    finally:
        temporary.unlink(missing_ok=True)


def verify_client(state, config, receipt=None):
    receipt = receipt or read_json(state / "current.json")
    request = read_json(state / "releases" / (receipt["release"] + ".json"))
    files = expected_files(
        state, request["packages"], receipt["terminal"], receipt["project"]
    )
    check_files(app_home(config), {name: digest(data) for name, data in files.items()})
    env = client_env(config)
    status = json_run(["herdr-app", "status"], env=env)
    if status.get("errors"):
        raise RuntimeError(f"window load errors: {status['errors']}")
    terminal = json_run(["hc", "get", receipt["terminal"], "--json"], env=env)
    if terminal.get("state") != "live" or terminal.get("name") != "chief-staff":
        raise RuntimeError("Chief of Staff terminal is not live")
    argv = terminal.get("foreground", {}).get("argv") or terminal.get("argv", [])
    if not argv or Path(argv[0]).name != "opencode":
        raise RuntimeError("Chief of Staff is occupied by an unexpected process")
    return {
        **receipt,
        "status": "verified",
        "verified_at": time.time(),
        "window": status,
    }


def recover(state, config):
    journal = read_json(state / "activation.json", {})
    if journal:
        restore(app_home(config), Path(journal["backup"]))
        refresh(config, journal["window"])
        if journal["previous"]:
            write_json(state / "current.json", journal["previous"])
        else:
            (state / "current.json").unlink(missing_ok=True)
        write_json(
            state / "recoveries" / (str(time.time_ns()) + ".json"),
            {**journal, "result": "restored"},
        )
        (state / "activation.json").unlink()


def activate(state, config, request):
    with locked(state, "client"):
        recover(state, config)
        packages = request["packages"]
        if set(packages) != set(PACKAGES) or release_id(packages) != request["release"]:
            raise RuntimeError("invalid release pair")
        env = client_env(config)
        home = app_home(config)
        before = json_run(["herdr-app", "status"], env=env)
        if before.get("overlays") or before.get("floats"):
            raise RuntimeError(
                f"client has open overlays or floating windows; activation pending until closed: {before}"
            )
        current = read_json(state / "current.json", {})
        if (
            current.get("release") == request["release"]
            and current.get("terminal") == request["terminal"]
        ):
            return verify_client(state, config, current)
        files = expected_files(state, packages, request["terminal"], request["project"])
        release = state / "releases" / (request["release"] + ".json")
        write_json(release, request)
        backup = state / "backups" / str(time.time_ns())
        entries = owned_entries(home, files)
        snapshot(home, backup, entries)
        journal = {
            "backup": str(backup),
            "previous": current,
            "window": before,
            "release": request["release"],
        }
        write_json(state / "activation.json", journal)
        try:
            # Swap entire owned directories: no stale files from an older package.
            with tempfile.TemporaryDirectory(prefix="install-", dir=state) as temp:
                tree = Path(temp)
                for name, data in files.items():
                    write_bytes(tree / name, data)
                for entry in entries:
                    dest = home / entry
                    remove(dest)
                    if (tree / entry).exists():
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.move(str(tree / entry), dest)
            refresh(config, before)
            if before["layout"] == "main-ids":
                json_run(["herdr-app", "do", "layout.show", "--id", "panel"], env=env)
                json_run(
                    [
                        "herdr-app",
                        "do",
                        "layout.select",
                        "--stack",
                        "panel-body",
                        "--child",
                        "chief",
                    ],
                    env=env,
                )
            receipt = {
                "schema": 1,
                "release": request["release"],
                "commits": {n: p["commit"] for n, p in packages.items()},
                "artifacts": {n: p["sha256"] for n, p in packages.items()},
                "terminal": request["terminal"],
                "project": request["project"],
                "backup": str(backup),
                "previous_release": current.get("release"),
                "activation": "activated",
                "activated_at": time.time(),
            }
            # Let real file watchers/attach settle, checking structured errors.
            deadline = time.monotonic() + 8
            while True:
                try:
                    receipt = verify_client(state, config, receipt)
                    break
                except RuntimeError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.25)
            for key in ("space", "tab", "focused_pane", "layout"):
                if receipt["window"].get(key) != before.get(key):
                    raise RuntimeError(f"activation changed active {key}")
            write_json(state / "receipts" / (str(time.time_ns()) + ".json"), receipt)
            write_json(state / "current.json", receipt)
            engine_source = (
                state
                / "packages/chief-of-staff"
                / packages["chief-of-staff"]["commit"]
                / "scripts/deploy.py"
            )
            if (state / "service.json").exists():
                write_bytes(state / "worker.py", engine_source.read_bytes())
            (state / "activation.json").unlink()
            return receipt
        except Exception as error:
            try:
                recover(state, config)
            except Exception as recovery:
                raise RuntimeError(
                    f"activation failed: {error}; recovery pending: {recovery}"
                ) from error
            raise RuntimeError(
                f"activation failed and previous installation restored: {error}"
            ) from error


def config_at(state):
    config = read_json(state / "config.json")
    if (
        config.get("schema") != 1
        or not NAME.fullmatch(config.get("node", ""))
        or not isinstance(config.get("coordinator"), dict)
    ):
        raise RuntimeError("invalid deployment configuration")
    if config["node"] == "laptop":
        clients = read_json(state / "clients.json")
        if not isinstance(clients, list) or len({c["name"] for c in clients}) != len(
            clients
        ):
            raise RuntimeError("invalid client registry")
        for client in clients:
            if not NAME.fullmatch(client.get("name", "")) or not (
                client.get("machine") is None or NAME.fullmatch(client["machine"])
            ):
                raise RuntimeError("invalid client identity")
        config["clients"] = clients
    return config


def rpc(target, request, timeout=50):
    # Both code and data are sent only through the authenticated hc connection.
    # The remote executes this exact engine; it never depends on a checkout.
    code = Path(__file__).read_text()
    payload = json.dumps(
        {"code": code, "request": request, "state": target.get("state")}
    ).encode()
    loader = (
        "import json,sys; p=json.load(sys.stdin); "
        'g={"__name__":"herdr_deploy_rpc","__file__":"<hc-deploy>"}; '
        'exec(p["code"],g); g["rpc_entry"](p)'
    )
    argv = ["python3", "-c", loader]
    if target.get("machine"):
        argv = [
            "hc",
            "exec",
            "--on",
            target["machine"],
            "--timeout",
            str(timeout),
            "-i",
            "--",
            *argv,
        ]
    reply = json.loads(run(argv, data=payload, timeout=timeout + 3))
    if not isinstance(reply, dict) or type(reply.get("ok")) is not bool:
        raise RuntimeError("invalid deployment RPC envelope")
    if not reply["ok"]:
        error = reply["error"]
        if (
            not isinstance(error, dict)
            or not isinstance(error.get("kind"), str)
            or not isinstance(error.get("message"), str)
        ):
            raise RuntimeError("invalid deployment RPC error schema")
        raise DeploymentError(error["kind"], error["message"])
    return reply["result"]


def rpc_dispatch(payload):
    state = Path(payload.get("state") or Path.home() / ".local/state/herdr-deploy")
    request = payload["request"]
    config = config_at(state)
    action = request.get("action")
    if action == "accept" and config["node"] == "laptop":
        result = accept(state, request["publication"])
        installed = read_json(state / "service.json", {})
        engine = installed.get("worker")
        if engine and Path(engine).is_file():
            with (state / "worker.log").open("ab") as log:
                subprocess.Popen(
                    [sys.executable, engine, "--state", str(state), "--worker"],
                    stdin=subprocess.DEVNULL,
                    stdout=log,
                    stderr=log,
                    start_new_session=True,
                )
    elif action == "status":
        result = status(state)
    elif action == "activate":
        result = activate(state, config, request["release"])
    elif action == "verify":
        with locked(state, "client"):
            recover(state, config)
            result = verify_client(state, config)
    else:
        raise RuntimeError("unsupported RPC action or coordinator identity")
    return result


def rpc_entry(payload):
    try:
        print(json.dumps({"ok": True, "result": rpc_dispatch(payload)}))
    except Exception as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": {
                        "kind": getattr(error, "kind", "failed"),
                        "message": str(error),
                    },
                }
            )
        )


def prepare_session(state, config, packages):
    chief = stage_package(state, packages["chief-of-staff"])
    project = config["project"]
    result = json_run(
        ["bun", chief / "scripts/prepare-session.mjs", project],
        env=client_env(config),
        timeout=40,
    )
    if not re.fullmatch(r"t[1-9][0-9a-z]*", result.get("address", "")):
        raise RuntimeError("session preparation returned an invalid local address")
    return result


def status(state):
    return {
        "catalog": read_json(state / "catalog.json", {}),
        "publications_pending": [
            p.stem for p in sorted((state / "outbox").glob("*.json"))
        ],
        "publications_failed": [
            read_json(p) for p in sorted((state / "publication-errors").glob("*.json"))
        ],
        "clients": read_json(state / "delivery.json", {}),
        "current": read_json(state / "current.json", {}),
    }


def worker(state):
    config = config_at(state)
    with locked(state, "worker", blocking=False):
        for path in sorted((state / "outbox").glob("*.json")):
            pub = read_json(path)
            try:
                result = (
                    accept(state, pub)
                    if config["node"] == "laptop"
                    else rpc(
                        config["coordinator"],
                        {"action": "accept", "publication": pub},
                        timeout=20,
                    )
                )
                write_json(state / "sent" / path.name, result)
                path.unlink()
                (state / "publication-errors" / path.name).unlink(missing_ok=True)
            except Exception as error:
                write_json(
                    state / "publication-errors" / path.name,
                    {
                        "publication": path.stem,
                        "error": str(error),
                        "time": time.time(),
                    },
                )
                if getattr(error, "kind", None) == "divergent":
                    (state / "conflicts").mkdir(exist_ok=True)
                    path.replace(state / "conflicts" / path.name)
        if config["node"] != "laptop":
            remote = rpc(config["coordinator"], {"action": "status"}, timeout=8)
            write_json(state / "delivery.json", remote["clients"])
            return status(state)
        catalog = read_json(state / "catalog.json", {})
        if set(catalog.get("packages", {})) != set(PACKAGES):
            return status(state)
        if not config["clients"]:
            return status(state)
        packages = {
            name: read_json(Path(meta["path"]))
            for name, meta in catalog["packages"].items()
        }
        deliveries = read_json(state / "delivery.json", {})
        try:
            session = prepare_session(state, config, packages)
        except Exception as error:
            for client in config["clients"]:
                deliveries[client["name"]] = {
                    "status": "failed",
                    "desired": catalog["release"],
                    "error": str(error),
                    "time": time.time(),
                }
            write_json(state / "delivery.json", deliveries)
            return status(state)
        for client in config["clients"]:
            name = client["name"]
            delivery = deliveries.get(name, {})
            # Rollback is pinned until a later accepted publication arrives.
            rollback = read_json(state / "rollbacks" / (name + ".json"), {})
            chosen = catalog
            selected = packages
            if rollback.get("catalog_release") == catalog["release"]:
                chosen = read_json(
                    state / "catalog-releases" / (rollback["release"] + ".json")
                )
                selected = {
                    n: read_json(Path(m["path"])) for n, m in chosen["packages"].items()
                }
            terminal = (
                session["address"]
                if name == "laptop"
                else "laptop/" + session["address"]
            )
            request = {
                "release": chosen["release"],
                "packages": selected,
                "terminal": terminal,
                "project": config["project"] if name == "laptop" else None,
            }
            target = {
                **client,
                "state": client.get("state")
                or (str(state) if name == "laptop" else None),
            }
            deliveries[name] = {
                **delivery,
                "status": "pending",
                "desired": chosen["release"],
                "time": time.time(),
            }
            write_json(state / "delivery.json", deliveries)
            try:
                if (
                    delivery.get("release") == chosen["release"]
                    and delivery.get("terminal") == terminal
                    and delivery.get("status") == "verified"
                ):
                    result = rpc(target, {"action": "verify"}, timeout=15)
                else:
                    result = rpc(target, {"action": "activate", "release": request})
                deliveries[name] = {**result, "desired": chosen["release"]}
            except Exception as error:
                # A failed attempt retains both last working receipt and desired release.
                deliveries[name] = {
                    **delivery,
                    "desired": chosen["release"],
                    "status": "pending"
                    if getattr(error, "kind", None) == "unavailable"
                    else "failed",
                    "error": str(error),
                    "time": time.time(),
                }
            write_json(state / "delivery.json", deliveries)
        return status(state)


def install_service(state):
    config = config_at(state)
    code = Path(__file__).read_bytes()
    engine = state / "engines" / digest(code) / "deploy.py"
    write_bytes(engine, code)
    executable = shutil.which("python3")
    stable = state / "worker.py"
    write_bytes(stable, code)
    argv = [executable, str(stable), "--state", str(state), "--worker"]
    env = client_env(config)
    environment = {
        k: env[k]
        for k in (
            "PATH",
            "HC_SESSION",
            "HC_SOCKET",
            "XDG_STATE_HOME",
            "XDG_CONFIG_HOME",
            "XDG_RUNTIME_DIR",
            "HERDR_APP_HOME",
        )
        if k in env
    }
    label = "local.herdr.package-deploy"
    if state != Path.home() / ".local/state/herdr-deploy":
        label += "." + digest(str(state).encode())[:10]
    log = state / "worker.log"
    if sys.platform == "darwin":
        path = Path.home() / "Library/LaunchAgents" / (label + ".plist")
        plist = {
            "Label": label,
            "ProgramArguments": argv,
            "RunAtLoad": True,
            "StartInterval": 60,
            "EnvironmentVariables": environment,
            "StandardOutPath": str(log),
            "StandardErrorPath": str(log),
        }
        write_bytes(path, plistlib.dumps(plist))
        domain = f"gui/{os.getuid()}"
        subprocess.run(
            ["launchctl", "bootout", domain + "/" + label], capture_output=True
        )
        run(["launchctl", "bootstrap", domain, path])
        run(["launchctl", "print", domain + "/" + label])
    elif sys.platform.startswith("linux"):
        folder = Path.home() / ".config/systemd/user"
        import shlex

        command = " ".join(
            '"'
            + part.replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%")
            + '"'
            for part in argv
        )
        settings = "\n".join(
            "Environment=" + shlex.quote(k + "=" + v) for k, v in environment.items()
        )
        write_bytes(
            folder / (label + ".service"),
            f"[Service]\nType=oneshot\n{settings}\nExecStart={command}\n".encode(),
        )
        write_bytes(
            folder / (label + ".timer"),
            b"[Timer]\nOnStartupSec=1\nOnUnitInactiveSec=60\nPersistent=true\n[Install]\nWantedBy=timers.target\n",
        )
        run(["systemctl", "--user", "daemon-reload"])
        run(["systemctl", "--user", "enable", "--now", label + ".timer"])
    else:
        raise RuntimeError(
            "retry service installation supports macOS and Linux; this OS needs an explicit scheduler adapter"
        )
    write_json(
        state / "service.json",
        {
            "label": label,
            "engine": str(engine),
            "worker": str(stable),
            "sha256": digest(code),
            "installed_at": time.time(),
        },
    )
    return {"service": label, "engine": str(engine)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--state",
        type=Path,
        default=Path(
            os.environ.get(
                "HERDR_DEPLOY_STATE", str(Path.home() / ".local/state/herdr-deploy")
            )
        ),
    )
    parser.add_argument("--repo", choices=PACKAGES)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parent.parent
    )
    parser.add_argument("--hook", action="store_true")
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--install-service", action="store_true")
    parser.add_argument("--init", metavar="NODE")
    parser.add_argument("--rollback", metavar="RELEASE")
    parser.add_argument("clients", nargs="*")
    args = parser.parse_args()
    state = args.state.resolve()
    if args.init:
        if not NAME.fullmatch(args.init):
            parser.error("invalid node name")
        path = state / "config.json"
        config = {
            "schema": 1,
            "node": args.init,
            "coordinator": {"machine": None if args.init == "laptop" else "laptop"},
            "project": str(Path.home() / "Projects/chief-of-staff"),
        }
        if path.exists():
            if config_at(state)["node"] != args.init:
                raise RuntimeError("configuration already belongs to another node")
        else:
            write_json(path, config)
        if args.init == "laptop" and not (state / "clients.json").exists():
            write_json(state / "clients.json", DEFAULT_CLIENTS)
        print(json.dumps(config_at(state)))
        return
    if args.dry_run:
        print(
            json.dumps(
                {
                    "clients": ["laptop", "holocron"],
                    "repo": args.repo,
                    "source": "git archive HEAD",
                    "session_host": "laptop",
                }
            )
        )
        if any(c not in ("laptop", "holocron", "local") for c in args.clients):
            raise RuntimeError("unknown client")
        return
    if not any(
        (args.status, args.verify, args.worker, args.install_service, args.rollback)
    ):
        # Must happen before loading config, connecting to hc or writing queues.
        if not primary(args.root):
            print("skip: publication requires a primary checkout on main")
            return
        if not args.repo:
            parser.error("--repo is required for publication")
        pub = make_publication(args.root, args.repo)
        enqueue(state, pub)
    config = config_at(state)
    os.environ.update(client_env(config))
    if args.clients and not (args.verify or args.rollback):
        raise RuntimeError(
            "publication always targets the explicit client registry; use --verify or --rollback to select clients"
        )
    if args.install_service:
        print(json.dumps(install_service(state)))
        return
    if args.rollback:
        if config["node"] != "laptop" or not args.clients:
            raise RuntimeError(
                "rollback requires the laptop coordinator and explicit registered clients"
            )
        release = args.rollback
        if not re.fullmatch("[0-9a-f]{24}", release):
            raise RuntimeError("invalid recorded release")
        chosen = read_json(state / "catalog-releases" / (release + ".json"))
        if set(chosen["packages"]) != set(PACKAGES):
            raise RuntimeError("rollback release does not contain both packages")
        for name in args.clients:
            if name not in [c["name"] for c in config["clients"]]:
                raise RuntimeError("unregistered rollback client")
            write_json(
                state / "rollbacks" / (name + ".json"),
                {
                    "release": release,
                    "catalog_release": read_json(state / "catalog.json")["release"],
                },
            )
    if args.status:
        result = (
            status(state)
            if config["node"] == "laptop"
            else rpc(config["coordinator"], {"action": "status"})
        )
    elif args.verify:
        if args.clients == ["local"]:
            result = verify_client(state, config)
        elif config["node"] == "laptop":
            result = {
                c["name"]: rpc(
                    {
                        **c,
                        "state": c.get("state")
                        or (str(state) if c["name"] == "laptop" else None),
                    },
                    {"action": "verify"},
                )
                for c in config["clients"]
                if not args.clients or c["name"] in args.clients
            }
            if not result:
                raise RuntimeError("no registered clients selected")
        else:
            raise RuntimeError("use --verify local on a client, or --verify on laptop")
    elif args.worker or args.rollback:
        try:
            result = worker(state)
        except BlockingIOError:
            result = {"status": "pending", "reason": "worker already running"}
    else:
        # The hook queues first, then gives the detached worker a bounded chance.
        # A scheduler restarts it after a crash; no partial activation is abandoned.
        state.mkdir(parents=True, exist_ok=True)
        with (state / "worker.log").open("ab") as log:
            process = subprocess.Popen(
                [sys.executable, __file__, "--state", str(state), "--worker"],
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            pass
        result = status(state)
        print(
            f"publication recorded: {args.repo} {pub['commit']}; commit success is not deployment proof"
        )
    print(json.dumps(result, indent=2))
    clients = result.get("clients", {})
    if isinstance(clients, dict):
        for name, delivery in clients.items():
            print(
                f"{name}: {delivery.get('status', 'pending')} {delivery.get('error', '')}"
            )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"deployment failed: {error}", file=sys.stderr)
        sys.exit(1)
