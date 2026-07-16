import { cpus } from "node:os";

import { BatchWorkerPool } from "../../simulator/src/workerPool";
import { WorkerThreadBatchWorker } from "../workerThreadBatchWorker";
import type { BattleSummary, BattleTask } from "./types";

export class TournamentWorkerPool {
  private readonly pool: BatchWorkerPool<BattleTask, BattleSummary>;

  constructor(size: number) {
    const count = Math.max(1, Math.floor(size || cpus().length || 1));
    this.pool = new BatchWorkerPool(
      count,
      () => new WorkerThreadBatchWorker<BattleTask, BattleSummary>(new URL("./worker.ts", import.meta.url)),
    );
  }

  run(task: BattleTask): Promise<BattleSummary> {
    return this.pool.runTask(task);
  }

  runBatch(tasks: BattleTask[]): Promise<BattleSummary[]> {
    return this.pool.runBatch(tasks);
  }

  close(): Promise<void> {
    return this.pool.close();
  }
}
