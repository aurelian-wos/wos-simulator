import assert from "node:assert/strict";
import { test } from "node:test";

import { readJsonOrThrow } from "./api";

test("readJsonOrThrow returns typed JSON for ok responses", async () => {
  const data = await readJsonOrThrow<{ value: number }>(
    Response.json({ value: 42 }),
    "Request",
  );

  assert.deepEqual(data, { value: 42 });
});

test("readJsonOrThrow prefers API error messages", async () => {
  const response = Response.json(
    { error: "Saved run not found" },
    { status: 404 },
  );

  await assert.rejects(
    readJsonOrThrow(response, "Saved run request"),
    /Saved run not found/,
  );
});

test("readJsonOrThrow falls back to status when no API error is present", async () => {
  const response = Response.json({}, { status: 500 });

  await assert.rejects(
    readJsonOrThrow(response, "Saved run request"),
    /Saved run request failed with 500/,
  );
});
