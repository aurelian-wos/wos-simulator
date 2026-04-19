CREATE TABLE IF NOT EXISTS coverage_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id),
    hero TEXT NOT NULL,
    skill_num INTEGER NOT NULL,
    skill_name TEXT NOT NULL,
    testcase_count INTEGER NOT NULL,
    battle_outcome_count INTEGER NOT NULL,
    covered_bool INTEGER NOT NULL,
    UNIQUE(run_id, hero, skill_num)
);
CREATE INDEX IF NOT EXISTS idx_coverage_run_id ON coverage_snapshots(run_id);
CREATE INDEX IF NOT EXISTS idx_coverage_hero ON coverage_snapshots(hero);
