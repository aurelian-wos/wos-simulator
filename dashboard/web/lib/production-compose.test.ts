import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("production compose only mounts public runtime paths", () => {
  const compose = readFileSync(path.join(repoRoot, "docker-compose.prod.yml"), "utf8");

  assert.match(compose, /- \$\{WOS_SIM_RUNS_DIR:-\/srv\/wos-sim\/runtime\/simulate-runs}:\/data\/simulations/);
  assert.match(compose, /- \.\/test_results:\/data\/test_results:rw/);
  assert.match(compose, /- \.\/skill:\/repo\/skill:ro/);

  assert.doesNotMatch(compose, /STAT_PRESETS_FILE/);
  assert.doesNotMatch(compose, /stat-presets/);
  assert.doesNotMatch(compose, /\/data\/stat-presets/);
  assert.doesNotMatch(compose, /- \.\/dashboard:\/repo\/dashboard:ro/);
  assert.doesNotMatch(compose, /- \.\/test_results:\/repo\/test_results:rw/);
  assert.doesNotMatch(compose, /archived\/v1/);
  assert.doesNotMatch(compose, /shared\/fighters_data/);
  assert.doesNotMatch(compose, /- \.\/testcases:/);
  assert.doesNotMatch(compose, /:\/(dashboard|skill|archived|shared|testcases|test_results)(:|$)/);
});
