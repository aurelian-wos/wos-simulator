from __future__ import annotations

import importlib
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "skill" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))


class FakeEmulator:
    def __init__(self) -> None:
        self.taps: list[tuple[int, int]] = []

    def screencap_bgr(self) -> np.ndarray:
        return np.zeros((1280, 720, 3), dtype=np.uint8)

    def tap(self, x: int, y: int) -> None:
        self.taps.append((x, y))


class HealQuickSelectTests(unittest.TestCase):
    def setUp(self) -> None:
        sys.modules.pop("heal", None)

        emulator = types.ModuleType("emulator")
        emulator.WosError = RuntimeError

        navigation = types.ModuleType("navigation")
        navigation.find_template = Mock(return_value=(True, (110, 945)))
        navigation.goto_world_map = Mock()
        navigation.WosNavigationError = RuntimeError

        alliance = types.ModuleType("alliance")
        alliance.ensure_in_alliance = Mock(return_value="")

        with patch.dict(
            sys.modules,
            {
                "emulator": emulator,
                "navigation": navigation,
                "alliance": alliance,
            },
        ):
            self.heal = importlib.import_module("heal")

    def tearDown(self) -> None:
        sys.modules.pop("heal", None)

    def test_quick_select_accepts_two_visible_zero_rows(self) -> None:
        emulator = FakeEmulator()
        zero_rows = [
            [(542, 403, 0.95)],
            [],
            [(542, 403, 0.95), (542, 542, 0.94)],
        ]

        with (
            patch.object(self.heal, "_find_zero_pill_matches", side_effect=zero_rows),
            patch.object(self.heal, "find_template", return_value=(True, (110, 945))),
            patch.object(self.heal.time, "sleep"),
        ):
            self.heal._double_tap_quick_select(emulator)

        self.assertEqual(emulator.taps, [(110, 945), (110, 945)])


if __name__ == "__main__":
    unittest.main()
