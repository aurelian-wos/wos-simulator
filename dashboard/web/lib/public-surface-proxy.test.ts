import assert from "node:assert/strict";
import { test } from "node:test";

import { isAllowedPublicPath } from "../proxy";

test("public simulate surface allows bundled example upload assets", () => {
  assert.equal(isAllowedPublicPath("/examples/stat-bonuses-report.png"), true);
});
