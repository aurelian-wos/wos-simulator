ALTER TABLE coverage_snapshots ADD COLUMN skill_id TEXT;
UPDATE coverage_snapshots SET skill_id = CAST(skill_num AS TEXT);

CREATE TABLE IF NOT EXISTS heroes (
    name TEXT PRIMARY KEY,
    classes TEXT NOT NULL DEFAULT '[]',
    tier TEXT
);

CREATE TABLE IF NOT EXISTS hero_skills (
    hero TEXT NOT NULL REFERENCES heroes(name),
    skill_id TEXT NOT NULL,
    name TEXT NOT NULL,
    json_path TEXT NOT NULL,
    PRIMARY KEY (hero, skill_id)
);
