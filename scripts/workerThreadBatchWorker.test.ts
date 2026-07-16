import assert from "node:assert/strict";
import { test } from "node:test";

import { BatchWorkerPool } from "../simulator/src/workerPool";
import { WorkerThreadBatchWorker } from "./workerThreadBatchWorker";

test("WorkerThreadBatchWorker adapts worker threads to BatchWorkerPool", async () => {
  const pool = new BatchWorkerPool<number, number, number>(
    2,
    () => new WorkerThreadBatchWorker(new URL("./workerThreadBatchWorker.fixture.ts", import.meta.url)),
  );
  const progress: Array<[number, number]> = [];

  try {
    const results = await pool.runBatches(
      [[1, 2], [3]],
      (batchIndex, done) => progress.push([batchIndex, done]),
    );
    assert.deepEqual(results, [2, 4, 6]);
    assert.deepEqual(progress.sort(([left], [right]) => left - right), [[0, 2], [1, 1]]);
  } finally {
    await pool.close();
  }
});
