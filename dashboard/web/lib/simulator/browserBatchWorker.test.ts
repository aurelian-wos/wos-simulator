import assert from "node:assert/strict";
import { test } from "node:test";

import type { BatchWorkerRequest, BatchWorkerResponse } from "@simulator/workerPool";
import { BrowserBatchRunner } from "../../app/simulate/browserBatchWorker";

interface WeightedTask {
  id: number;
  weight: number;
}

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<BatchWorkerResponse<number, number>>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: BatchWorkerRequest<WeightedTask>): void {
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          id: request.id,
          type: "progress",
          progress: request.tasks.reduce((sum, task) => sum + task.weight, 0),
        },
      } as MessageEvent<BatchWorkerResponse<number, number>>);
      this.onmessage?.({
        data: {
          id: request.id,
          type: "result",
          results: request.tasks.map((task) => task.id),
        },
      } as MessageEvent<BatchWorkerResponse<number, number>>);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

test("BrowserBatchRunner uses BatchWorkerPool for weighted batches and aggregate progress", async () => {
  const originalWorker = globalThis.Worker;
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  const runner = new BrowserBatchRunner<WeightedTask, number>(2, () => new Worker("file:///fake-worker.js"));
  const progress: Array<[number, number]> = [];

  try {
    const results = await runner.run(
      [
        { id: 1, weight: 2 },
        { id: 2, weight: 1 },
        { id: 3, weight: 3 },
      ],
      {
        getWeight: (task) => task.weight,
        onProgress: (done, total) => progress.push([done, total]),
      },
    );

    assert.deepEqual(results, [1, 2, 3]);
    assert.deepEqual(progress.at(-1), [6, 6]);
    assert.equal(FakeWorker.instances.length, 2);
  } finally {
    await runner.close();
    globalThis.Worker = originalWorker;
  }

  assert.ok(FakeWorker.instances.every((worker) => worker.terminated));
});
