import { createRequire } from "node:module";
import { cpus } from "node:os";
import { Worker } from "node:worker_threads";

import { BatchWorkerPool, type BatchWorker } from "../../simulator/src/workerPool";
import type { BattleSummary, BattleTask } from "./types";

interface WorkerResponse {
  id: number;
  result?: BattleSummary;
  results?: BattleSummary[];
  error?: string;
}

type RejectFn = (error: Error) => void;

class TournamentWorkerThread implements BatchWorker<BattleTask, BattleSummary> {
  private readonly worker: Worker;
  private rejectInFlight?: RejectFn;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      execArgv: ["--import", resolveTsxLoader()]
    });
  }

  runBatch(id: number, tasks: BattleTask[]): Promise<BattleSummary[]> {
    if (this.rejectInFlight) return Promise.reject(new Error("Tournament worker already has an in-flight batch"));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.rejectInFlight = undefined;
        this.worker.off("message", onMessage);
        this.worker.off("error", onError);
        this.worker.off("exit", onExit);
      };
      const onMessage = (message: unknown) => {
        const response = message as WorkerResponse;
        if (response.id !== id) return;
        cleanup();
        if (response.error) reject(new Error(response.error));
        else if (response.results) resolve(response.results);
        else if (response.result) resolve([response.result]);
        else reject(new Error(`Malformed tournament worker response for job ${response.id}`));
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onExit = (code: number) => {
        cleanup();
        reject(new Error(`Tournament worker exited with code ${code}`));
      };
      this.rejectInFlight = reject;
      this.worker.on("message", onMessage);
      this.worker.once("error", onError);
      this.worker.once("exit", onExit);
      this.worker.postMessage({ id, tasks });
    });
  }

  async close(): Promise<void> {
    if (this.rejectInFlight) {
      this.rejectInFlight(new Error("Tournament worker closed before completing in-flight batch"));
      this.rejectInFlight = undefined;
    }
    await this.worker.terminate();
  }
}

export class TournamentWorkerPool {
  private readonly pool: BatchWorkerPool<BattleTask, BattleSummary>;

  constructor(size: number) {
    const count = Math.max(1, Math.floor(size || cpus().length || 1));
    this.pool = new BatchWorkerPool(count, () => new TournamentWorkerThread());
  }

  run(task: BattleTask): Promise<BattleSummary> {
    return this.runBatch([task]).then((results) => {
      const result = results[0];
      if (!result) throw new Error("Tournament worker returned no result");
      return result;
    });
  }

  runBatch(tasks: BattleTask[]): Promise<BattleSummary[]> {
    return this.pool.runBatch(tasks);
  }

  close(): Promise<void> {
    return this.pool.close();
  }
}

function resolveTsxLoader(): string {
  const requireFromSimulator = createRequire(new URL("../../simulator/package.json", import.meta.url));
  return requireFromSimulator.resolve("tsx");
}
