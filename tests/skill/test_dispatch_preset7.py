from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "skill" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

navigation = types.ModuleType("navigation")
navigation.find_template = lambda *_args, **_kwargs: (False, (0, 0))
navigation.goto_world_map = lambda *_args, **_kwargs: None
navigation.WosNavigationError = RuntimeError
sys.modules.setdefault("navigation", navigation)

import dispatch


class FakeEmulator:
    def __init__(self) -> None:
        self.taps: list[tuple[int, int]] = []

    def screencap_bgr(self):
        return np.zeros((1280, 720, 3), dtype=np.uint8)

    def tap(self, x: int, y: int) -> None:
        self.taps.append((x, y))


class DispatchPreset7Tests(unittest.TestCase):
    def test_load_preset7_selects_slot_verifies_and_deploys(self) -> None:
        calls: list[str] = []

        def fake_find_template(_img, template_path, threshold=0.85):
            calls.append(Path(template_path).name)
            return True, (111, 222)

        emulator = FakeEmulator()
        army_spec = {"heroes": {"Molly": {}}, "troops": {"infantry_t6": 100}}

        with patch.object(dispatch, "find_template", side_effect=fake_find_template), \
                patch.object(dispatch.time, "sleep", return_value=None), \
                patch.object(dispatch, "_assign_hero") as assign_hero, \
                patch.object(dispatch, "_ocr_troop_rows") as ocr_rows:
            result = dispatch.deploy_army(emulator, army_spec, preset_mode="load")

        self.assertTrue(result["ok"])
        self.assertEqual(result["preset"], 7)
        self.assertEqual(
            calls,
            ["flag_7.png", "flag_7_selected.png", "deploy_button.png"],
        )
        self.assertEqual(emulator.taps, [(111, 222), (111, 222)])
        assign_hero.assert_not_called()
        ocr_rows.assert_not_called()


if __name__ == "__main__":
    unittest.main()
