from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "skill" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from instance_lock import InstanceLockError, lock_instances, testcase_instance_names


class InstanceLockTests(unittest.TestCase):
    def test_multi_instance_lock_acquires_in_sorted_order_and_releases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lock_dir = Path(tmp)

            with lock_instances(["WIP", "minxxx"], lock_dir):
                lock_files = sorted(path.name for path in lock_dir.iterdir())
                self.assertEqual(lock_files, ["minxxx.lock", "wip.lock"])
                owners = [
                    json.loads((lock_dir / name).read_text())["instance_name"]
                    for name in lock_files
                ]
                self.assertEqual(owners, ["minxxx", "WIP"])

            self.assertEqual(list(lock_dir.iterdir()), [])

    def test_collision_fails_fast_with_owner_pid_and_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lock_dir = Path(tmp)

            with lock_instances(["WIP"], lock_dir):
                with self.assertRaises(InstanceLockError) as caught:
                    with lock_instances(["WIP"], lock_dir):
                        pass

            message = str(caught.exception)
            self.assertIn("Instance 'WIP' is already locked", message)
            self.assertIn(f"pid={os.getpid()}", message)
            self.assertIn("command=", message)

    def test_stale_lock_from_dead_pid_is_removed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lock_dir = Path(tmp)
            lock_dir.mkdir(exist_ok=True)
            stale = lock_dir / "wip.lock"
            stale.write_text(json.dumps({"instance_name": "WIP", "pid": 999999999}) + "\n")

            with lock_instances(["WIP"], lock_dir):
                owner = json.loads(stale.read_text())
                self.assertEqual(owner["pid"], os.getpid())

            self.assertFalse(stale.exists())

    def test_run_testcase_spec_instance_names_are_unique_and_sorted(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            spec = Path(tmp) / "spec.json"
            spec.write_text(json.dumps({
                "emulator": {
                    "defender": {"instance": "minxxx"},
                    "attacker": {"instance": "WIP"},
                    "observer": {"instance": "wip"},
                }
            }))

            self.assertEqual(testcase_instance_names(spec), ["minxxx", "WIP"])


if __name__ == "__main__":
    unittest.main()
