"""Unit + integration tests for dashboard.ocr_report.

Covers:
  - Parsing helpers (_parse_stat_row_from_text, _match_stat_label).
  - Linear-fit band prediction for missing stat rows.
  - End-to-end retry: a slightly-faded stat row that the primary PSM 6
    pass misses but the hardened retry path recovers.

The end-to-end test depends on having the tesseract binary installed. It
is skipped automatically when tesseract is missing.
"""

from __future__ import annotations

import io
import shutil
import sys
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dashboard.ocr_report import (  # noqa: E402
    STAT_ROW_ORDER,
    _linear_fit,
    _match_stat_label,
    _parse_stat_row_from_text,
    _parse_stats,
    parse_report,
    predict_missing_row_bands,
)


FIXTURES = Path(__file__).parent / "fixtures"
STAT_BONUSES_PNG = FIXTURES / "stat_bonuses.png"

TESSERACT_AVAILABLE = shutil.which("tesseract") is not None


class ParseStatRowTests(unittest.TestCase):
    def test_plain_row(self) -> None:
        got = _parse_stat_row_from_text("+1736.7% Infantry Attack +2045.0%")
        self.assertEqual(got, (("infantry", "attack"), (1736.7, 2045.0)))

    def test_missing_space_between_label_parts(self) -> None:
        got = _parse_stat_row_from_text("+1746.4% = InfantryDefense +2039.2%")
        self.assertEqual(got, (("infantry", "defense"), (1746.4, 2039.2)))

    def test_dropped_plus_sign(self) -> None:
        got = _parse_stat_row_from_text("1769.2% Lancer Attack 1944.2%")
        self.assertEqual(got, (("lancer", "attack"), (1769.2, 1944.2)))

    def test_trailing_noise_ignored(self) -> None:
        got = _parse_stat_row_from_text("+2285.5% LancerLethality +2068.8% >")
        self.assertEqual(got, (("lancer", "lethality"), (2285.5, 2068.8)))

    def test_non_stat_line_rejected(self) -> None:
        self.assertIsNone(_parse_stat_row_from_text("™_ Stat/Bonuses Oo"))
        self.assertIsNone(
            _parse_stat_row_from_text("759,030 89,713 867,177 731,618 319,320 433,214")
        )


class MatchStatLabelTests(unittest.TestCase):
    def test_exact(self) -> None:
        self.assertEqual(_match_stat_label("Infantry Attack"), ("infantry", "attack"))

    def test_no_space(self) -> None:
        self.assertEqual(_match_stat_label("LancerLethality"), ("lancer", "lethality"))

    def test_with_punctuation(self) -> None:
        self.assertEqual(_match_stat_label("Marksman:Health!"), ("marksman", "health"))

    def test_unknown(self) -> None:
        self.assertIsNone(_match_stat_label("Cavalry Dread"))


class LinearFitTests(unittest.TestCase):
    def test_two_points(self) -> None:
        slope, intercept = _linear_fit([(0.0, 100.0), (4.0, 300.0)])  # type: ignore[misc]
        self.assertAlmostEqual(slope, 50.0)
        self.assertAlmostEqual(intercept, 100.0)

    def test_insufficient_points(self) -> None:
        self.assertIsNone(_linear_fit([(0.0, 100.0)]))

    def test_degenerate(self) -> None:
        self.assertIsNone(_linear_fit([(1.0, 50.0), (1.0, 60.0)]))


class PredictMissingRowBandsTests(unittest.TestCase):
    def test_interior_row_missing(self) -> None:
        # Simulate primary pass finding 11 of 12 rows with 60-px spacing
        # starting at y=100. The missing row is ("infantry", "lethality")
        # which is index 2 -> expected center y = 100 + 2*60 = 220.
        found: dict[tuple[str, str], float] = {}
        for i, key in enumerate(STAT_ROW_ORDER):
            if key == ("infantry", "lethality"):
                continue
            found[key] = 100.0 + i * 60.0
        bands = predict_missing_row_bands(
            found, [("infantry", "lethality")], img_height=1000
        )
        self.assertEqual(len(bands), 1)
        key, top, bot = bands[0]
        self.assertEqual(key, ("infantry", "lethality"))
        center = (top + bot) / 2
        self.assertAlmostEqual(center, 220.0, delta=2.0)
        # Band should straddle the predicted row with generous padding.
        self.assertGreater(bot - top, 40)

    def test_no_found_rows_returns_nothing(self) -> None:
        self.assertEqual(
            predict_missing_row_bands({}, list(STAT_ROW_ORDER), img_height=1000), []
        )


class ParseStatsPositionsTests(unittest.TestCase):
    def test_center_y_tracks_line_midpoint(self) -> None:
        lines = [
            {"text": "+1736.7% Infantry Attack +2045.0%", "top": 100, "bottom": 120},
            {"text": "+1746.4% Infantry Defense +2039.2%", "top": 160, "bottom": 180},
        ]
        stats, center_y, warnings = _parse_stats(lines)  # type: ignore[arg-type]
        self.assertEqual(stats[("infantry", "attack")], (1736.7, 2045.0))
        self.assertEqual(center_y[("infantry", "attack")], 110.0)
        self.assertEqual(center_y[("infantry", "defense")], 170.0)
        self.assertEqual(warnings, [])

    def test_duplicate_row_keeps_first_and_warns(self) -> None:
        lines = [
            {"text": "+1736.7% Infantry Attack +2045.0%", "top": 100, "bottom": 120},
            {"text": "+9999.0% InfantryAttack +8888.0%", "top": 500, "bottom": 520},
        ]
        stats, _center_y, warnings = _parse_stats(lines)  # type: ignore[arg-type]
        self.assertEqual(stats[("infantry", "attack")], (1736.7, 2045.0))
        self.assertTrue(any("duplicate" in w for w in warnings))


@unittest.skipUnless(
    TESSERACT_AVAILABLE and STAT_BONUSES_PNG.exists(),
    "tesseract binary or fixture image unavailable",
)
class ParseReportIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.image_bytes = STAT_BONUSES_PNG.read_bytes()

    def test_clean_image_parses_all_rows(self) -> None:
        result = parse_report(self.image_bytes)
        self.assertEqual(result["warnings"], [])
        self.assertFalse(result["ocr_retried"])
        for cat in ("infantry", "lancer", "marksman"):
            for stat in ("attack", "defense", "lethality", "health"):
                self.assertIsNotNone(
                    result["attacker"]["stats"][cat][stat],
                    f"attacker {cat} {stat} should be populated",
                )
                self.assertIsNotNone(
                    result["defender"]["stats"][cat][stat],
                    f"defender {cat} {stat} should be populated",
                )

    def test_faded_row_recovered_by_retry(self) -> None:
        """Fade the Infantry Lethality row until primary PSM 6 misses it.

        The hardened retry path must recover the value silently.
        """
        img = Image.open(io.BytesIO(self.image_bytes)).convert("RGB")
        # Infantry Lethality is the 3rd stat row. In this fixture it sits at
        # roughly y=280-315. Blend with the background tan color to drop its
        # contrast below PSM 6's detection floor while keeping pixels readable.
        row = img.crop((0, 278, img.width, 315))
        overlay = Image.new("RGB", row.size, (246, 232, 200))
        from PIL import Image as _PIL  # local import to satisfy linters

        blended = _PIL.blend(row, overlay, 0.70)
        img.paste(blended, (0, 278))
        buf = io.BytesIO()
        img.save(buf, format="PNG")

        result = parse_report(buf.getvalue())

        self.assertTrue(
            result["ocr_retried"],
            "retry path should have been triggered by faded row",
        )
        self.assertEqual(
            result["warnings"], [], f"expected silent recovery, got: {result['warnings']}"
        )
        self.assertIsNotNone(
            result["attacker"]["stats"]["infantry"]["lethality"],
            "infantry lethality should have been recovered by the retry",
        )


if __name__ == "__main__":
    unittest.main()
