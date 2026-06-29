import assert from "node:assert/strict";
import { test } from "node:test";

import { winrateColor } from "./winrate-color";

test("winrateColor keeps the midpoint neutral", () => {
  assert.equal(winrateColor(0.5), "rgb(248,248,248)");
});

test("winrateColor saturates strong wins and losses before the extremes", () => {
  assert.equal(winrateColor(0.8), "rgb(255,75,75)");
  assert.equal(winrateColor(0.2), "rgb(75,75,255)");
});

test("winrateColor clamps values outside the winrate range", () => {
  assert.equal(winrateColor(-1), "rgb(0,0,255)");
  assert.equal(winrateColor(2), "rgb(255,0,0)");
});
