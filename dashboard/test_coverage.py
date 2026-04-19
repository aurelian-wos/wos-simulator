"""Regression tests for dashboard.coverage — WOS-165."""

import json
import sqlite3
import unittest
from pathlib import Path

from dashboard.ingest import open_db
from dashboard.coverage import snapshot_coverage, _load_hero_skills

REPO_ROOT = Path(__file__).parent.parent

TIER1_HEROES = {
    "Gwen", "Hector", "Norah", "Mia", "Lynn", "Logan",
    "Reina", "Greg", "Alonso", "Philly", "Flint", "Zinman", "Molly",
}

FAKE_RUN_ID = "00000000-0000-0000-0000-000000000001"


class TestSnapshotCoverage(unittest.TestCase):

    def setUp(self):
        self.conn = open_db(":memory:")
        self.conn.execute(
            """
            INSERT INTO runs (
                id, finished_at, git_sha, dirty,
                cli_args_json, thresholds_json, summary_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (FAKE_RUN_ID, "2026-01-01T00:00:00", "abc123", 0, "{}", "{}", "{}"),
        )
        self.conn.commit()

    def tearDown(self):
        self.conn.close()

    def test_row_count_matches_hero_skills(self):
        skills = _load_hero_skills(REPO_ROOT)
        expected = len(skills)
        inserted = snapshot_coverage(FAKE_RUN_ID, self.conn, REPO_ROOT)
        self.assertEqual(inserted, expected)

    def test_row_count_in_db(self):
        skills = _load_hero_skills(REPO_ROOT)
        snapshot_coverage(FAKE_RUN_ID, self.conn, REPO_ROOT)
        count = self.conn.execute(
            "SELECT COUNT(*) FROM coverage_snapshots WHERE run_id = ?",
            (FAKE_RUN_ID,),
        ).fetchone()[0]
        self.assertEqual(count, len(skills))

    def test_tier1_heroes_have_testcase_coverage(self):
        snapshot_coverage(FAKE_RUN_ID, self.conn, REPO_ROOT)
        rows = self.conn.execute(
            """
            SELECT hero, MAX(testcase_count) as max_tc
            FROM coverage_snapshots
            WHERE run_id = ?
            GROUP BY hero
            """,
            (FAKE_RUN_ID,),
        ).fetchall()
        covered = {hero for hero, max_tc in rows if max_tc > 0}
        missing = TIER1_HEROES - covered
        self.assertFalse(
            missing,
            f"Tier 1 heroes with no testcase coverage: {sorted(missing)}",
        )


if __name__ == "__main__":
    unittest.main()
