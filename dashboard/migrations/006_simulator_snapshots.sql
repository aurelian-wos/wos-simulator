-- WOS-200: Eliminate runtime `git` dependency in the dashboard container.
-- Diffs are now materialised at ingest time. Each run captures:
--   * a simulator_snapshot tarball blob — full content of every simulator-
--     relevant file (dirty state, tracked+untracked). Two runs' snapshots
--     can be diffed in-process without touching git at runtime.
--   * the HEAD commit's subject/author/date on the run row — used by the
--     home-page "Recent changes" widget and compare-page commit log in
--     place of live `git log` calls.
--
-- The blobs CHECK constraint must be extended to allow the new kind. SQLite
-- requires a full table rebuild for CHECK changes. Foreign keys from
-- runs.*_blob_id into blobs.id are preserved because blobs_new is renamed
-- to the "blobs" name that the FK clauses already reference.

CREATE TABLE blobs_new (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('patch', 'untracked_manifest', 'simulator_snapshot')),
    content_gzip BLOB NOT NULL
);

INSERT INTO blobs_new(id, kind, content_gzip)
    SELECT id, kind, content_gzip FROM blobs;

DROP TABLE blobs;

ALTER TABLE blobs_new RENAME TO blobs;

ALTER TABLE runs ADD COLUMN snapshot_blob_id TEXT REFERENCES blobs(id);
ALTER TABLE runs ADD COLUMN commit_subject TEXT;
ALTER TABLE runs ADD COLUMN commit_author TEXT;
ALTER TABLE runs ADD COLUMN commit_date TEXT;

CREATE INDEX IF NOT EXISTS idx_runs_commit_date ON runs(commit_date);
