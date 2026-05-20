from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "skill" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import run_testcase


class RunTestcaseStatsTests(unittest.TestCase):
    def test_map_stats_rejects_empty_stat_bonuses(self) -> None:
        with self.assertRaisesRegex(ValueError, "stat_bonuses empty for attacker"):
            run_testcase._map_stats({}, side="attacker")

    def test_map_stats_rejects_missing_stat_bonuses_value(self) -> None:
        with self.assertRaisesRegex(ValueError, "stats OCR produced no output"):
            run_testcase._map_stats(None, side="defender")


if __name__ == "__main__":
    unittest.main()
