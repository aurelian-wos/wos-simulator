import assert from "node:assert/strict";
import { test } from "node:test";

import { recommendedBrowserWorkerCount } from "./worker-count";

test("recommendedBrowserWorkerCount leaves one available processor free", () => {
  assert.equal(recommendedBrowserWorkerCount(16), 15);
  assert.equal(recommendedBrowserWorkerCount(2), 1);
  assert.equal(recommendedBrowserWorkerCount(1), 1);
  assert.equal(recommendedBrowserWorkerCount(undefined), 1);
});
