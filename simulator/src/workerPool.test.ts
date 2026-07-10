import assert from "node:assert/strict";
import { test } from "node:test";

import { BatchWorkerPool, batchTasksByWeight, type BatchWorker } from "./workerPool";

class DeferredWorker implements BatchWorker<number, number> {
  calls: Array<{ id: number; tasks: number[] }> = [];
  private pending: Array<{ resolve: (results: number[]) => void; reject: (error: Error) => void }> = [];

  runBatch(id: number, tasks: number[]): Promise<number[]> {
    this.calls.push({ id, tasks });
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }

  resolveNext(results: number[]): void {
    const pending = this.pending.shift();
    if (!pending) throw new Error("No pending worker batch");
    pending.resolve(results);
  }

  close(): void {
    while (this.pending.length > 0) this.pending.shift()!.reject(new Error("closed"));
  }
}

test("BatchWorkerPool refills idle workers from the queue", async () => {
  const workers = [new DeferredWorker(), new DeferredWorker()];
  const pool = new BatchWorkerPool<number, number>(2, (index) => workers[index]!);

  const first = pool.runBatch([1]);
  const second = pool.runBatch([2]);
  const third = pool.runBatch([3]);

  assert.deepEqual(workers.map((worker) => worker.calls.map((call) => call.tasks)), [[[1]], [[2]]]);

  workers[0]!.resolveNext([10]);
  assert.deepEqual(await first, [10]);
  assert.deepEqual(workers[0]!.calls.map((call) => call.tasks), [[1], [3]]);

  workers[1]!.resolveNext([20]);
  workers[0]!.resolveNext([30]);
  assert.deepEqual(await second, [20]);
  assert.deepEqual(await third, [30]);

  await pool.close();
});

test("batchTasksByWeight groups tasks without exceeding the target when possible", () => {
  assert.deepEqual(
    batchTasksByWeight([1, 1, 3, 1, 1], 2, (value) => value),
    [[1, 1], [3], [1, 1]]
  );
});
