"""Portable release tests use real Git histories, archives and filesystem locks."""

import concurrent.futures
import importlib.util
import json
import os
import shutil
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "deploy", Path(__file__).parents[1] / "scripts/deploy.py"
)
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class Releases(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="herdr-release-test-")
        self.root = Path(self.temp.name)
        self.state = self.root / "state"

    def tearDown(self):
        self.temp.cleanup()

    def git(self, repo, *args):
        return (
            subprocess.check_output(
                ["git", "-C", str(repo), *args],
                stderr=subprocess.PIPE,
                env={**os.environ, "HERDR_DEPLOY_STATE": str(self.state)},
            )
            .decode()
            .strip()
        )

    def repo(self, name):
        repo = self.root / name
        repo.mkdir()
        self.git(repo, "init", "-b", "main")
        self.git(repo, "config", "user.email", "test@example.invalid")
        self.git(repo, "config", "user.name", "Release test")
        self.git(repo, "config", "core.hooksPath", str(self.root / "empty-hooks"))
        self.commit(repo, "first")
        return repo

    def commit(self, repo, content):
        (repo / "payload.txt").write_text(content)
        self.git(repo, "add", "payload.txt")
        self.git(repo, "commit", "-m", content)
        return self.git(repo, "rev-parse", "HEAD")

    def test_archive_is_committed_content_and_corruption_fails(self):
        repo = self.repo("chief-of-staff")
        (repo / "payload.txt").write_text("uncommitted")
        pub = deploy.make_publication(repo, "chief-of-staff")
        deploy.accept(self.state, pub)
        target = deploy.stage_package(self.state, pub)
        self.assertEqual((target / "payload.txt").read_text(), "first")
        (target / "payload.txt").write_text("corrupt")
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            deploy.stage_package(self.state, pub)
        damaged = dict(pub, archive=pub["archive"][:-4] + "AAAA")
        with self.assertRaises(RuntimeError):
            deploy.accept(self.root / "damaged", damaged)

    def test_ancestry_deduplication_and_divergence(self):
        repo = self.repo("chief-of-staff")
        first = deploy.make_publication(repo, "chief-of-staff")
        self.assertEqual(deploy.accept(self.state, first)["result"], "accepted")
        self.assertEqual(deploy.accept(self.state, first)["result"], "duplicate")
        self.commit(repo, "second")
        second = deploy.make_publication(repo, "chief-of-staff")
        self.assertEqual(deploy.accept(self.state, second)["result"], "accepted")
        self.assertEqual(deploy.accept(self.state, first)["result"], "superseded")
        self.git(repo, "checkout", "-b", "divergent", first["commit"])
        self.commit(repo, "fork")
        fork = deploy.make_publication(repo, "chief-of-staff")
        with self.assertRaisesRegex(RuntimeError, "divergent"):
            deploy.accept(self.state, fork)
        self.assertEqual(
            deploy.read_json(self.state / "catalog.json")["packages"]["chief-of-staff"][
                "commit"
            ],
            second["commit"],
        )

    def test_concurrent_repositories_retain_each_other(self):
        publications = [
            deploy.make_publication(self.repo(name), name) for name in deploy.PACKAGES
        ]
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results = list(
                pool.map(lambda pub: deploy.accept(self.state, pub), publications)
            )
        self.assertEqual([r["result"] for r in results], ["accepted", "accepted"])
        catalog = deploy.read_json(self.state / "catalog.json")
        self.assertEqual(
            {name: pub["commit"] for name, pub in catalog["packages"].items()},
            {pub["repo"]: pub["commit"] for pub in publications},
        )

    def test_primary_guard_and_durable_queue(self):
        repo = self.repo("chief-of-staff")
        self.assertTrue(deploy.primary(repo))
        worktree = self.root / "worktree"
        self.git(repo, "worktree", "add", "-b", "feature", str(worktree))
        self.assertFalse(deploy.primary(worktree))
        self.git(repo, "checkout", "-b", "non-main")
        self.assertFalse(deploy.primary(repo))
        pub = deploy.make_publication(repo, "chief-of-staff")
        queue = deploy.enqueue(self.state, pub)
        self.assertEqual(json.loads(queue.read_text()), pub)
        self.assertEqual(deploy.enqueue(self.state, pub), queue)

    def test_real_main_and_merge_hooks_publish_but_worktrees_do_not(self):
        repo = self.repo("chief-of-staff")
        source = Path(__file__).parents[1]
        package = (
            "herdr-ids"
            if (source / "layouts/main-ids.json").exists()
            else "chief-of-staff"
        )
        (repo / "scripts").mkdir()
        for name in ("sync.sh", "deploy.py"):
            shutil.copy2(source / "scripts" / name, repo / "scripts" / name)
        shutil.copytree(source / ".githooks", repo / ".githooks")
        # Keep the actual post hooks, with no dependency on this project's lint.
        (repo / ".githooks/pre-commit").unlink()
        (repo / ".githooks/pre-push").unlink()
        deploy.write_json(
            self.state / "config.json",
            {
                "schema": 1,
                "node": "laptop",
                "coordinator": {"machine": None},
                "project": str(repo),
            },
        )
        deploy.write_json(self.state / "clients.json", [])
        self.git(repo, "config", "core.hooksPath", ".githooks")
        self.git(repo, "add", ".")
        first = self.commit(repo, "main publication")
        self.assertEqual(
            deploy.read_json(self.state / "catalog.json")["packages"][package][
                "commit"
            ],
            first,
        )
        worktree = self.root / "linked"
        self.git(repo, "worktree", "add", "-b", "feature", str(worktree))
        next_commit = self.commit(worktree, "worktree publication forbidden")
        self.assertEqual(
            deploy.read_json(self.state / "catalog.json")["packages"][package][
                "commit"
            ],
            first,
        )
        self.git(repo, "merge", "--ff-only", "feature")
        self.assertEqual(
            deploy.read_json(self.state / "catalog.json")["packages"][package][
                "commit"
            ],
            next_commit,
        )
        self.git(repo, "checkout", "-b", "non-main")
        self.commit(repo, "primary non-main publication forbidden")
        self.assertEqual(
            deploy.read_json(self.state / "catalog.json")["packages"][package][
                "commit"
            ],
            next_commit,
        )

    def test_hook_install_preserves_previous_hooks_and_uses_installed_engine(self):
        repo = self.repo("publishing-checkout")
        source = Path(__file__).parents[1]
        package = (
            "herdr-ids"
            if (source / "layouts/main-ids.json").exists()
            else "chief-of-staff"
        )
        old = repo / "old-hooks"
        old.mkdir()
        (old / "post-commit").write_text("retained original hook")
        self.git(repo, "config", "core.hooksPath", str(old))
        deploy.write_json(
            self.state / "config.json",
            {
                "schema": 1,
                "node": "laptop",
                "coordinator": {"machine": None},
                "project": str(repo),
            },
        )
        deploy.write_json(self.state / "clients.json", [])
        (self.state / "worker.py").write_bytes(
            (source / "scripts/deploy.py").read_bytes()
        )
        env = {**os.environ, "HERDR_DEPLOY_STATE": str(self.state)}
        subprocess.run(
            ["sh", str(source / "scripts/install-hooks.sh"), str(repo)],
            env=env,
            capture_output=True,
            check=True,
        )
        installed = Path(self.git(repo, "config", "--get", "core.hooksPath"))
        backups = list(
            (self.state / "hook-backups" / package).glob("*/hooks/post-commit")
        )
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), "retained original hook")
        subprocess.run(
            [str(installed / "post-commit")],
            cwd=repo,
            env=env,
            capture_output=True,
            check=True,
        )
        self.assertEqual(
            deploy.read_json(self.state / "catalog.json")["packages"][package][
                "commit"
            ],
            self.git(repo, "rev-parse", "HEAD"),
        )
        self.assertEqual((old / "post-commit").read_text(), "retained original hook")


if __name__ == "__main__":
    unittest.main()
