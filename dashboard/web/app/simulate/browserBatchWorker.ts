import {
  BatchWorkerPool,
  batchTasksByWeight,
  type BatchWorker,
  type BatchWorkerRequest,
  type BatchWorkerResponse,
} from "@simulator/workerPool";

type RunBatch<TTask, TResult, TContext> = (
  tasks: TTask[],
  context: TContext | undefined,
  onProgress: (progress: number) => void,
) => Promise<TResult[]> | TResult[];

interface RunTasksOptions<TTask> {
  getWeight?: (task: TTask) => number;
  targetBatchWeight?: number;
  progressMode?: "cumulative" | "incremental";
  onProgress?: (progress: number, total: number) => void;
}

export class BrowserBatchWorker<TTask, TResult, TContext = undefined>
implements BatchWorker<TTask, TResult, number> {
  private readonly worker: Worker;
  private rejectInFlight?: (error: Error) => void;

  constructor(worker: Worker, private readonly context?: TContext) {
    this.worker = worker;
  }

  runBatch(
    id: number,
    tasks: TTask[],
    onProgress?: (progress: number) => void,
  ): Promise<TResult[]> {
    if (this.rejectInFlight) return Promise.reject(new Error("Browser worker already has an in-flight batch"));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.rejectInFlight = undefined;
        this.worker.onmessage = null;
        this.worker.onerror = null;
      };
      this.rejectInFlight = reject;
      this.worker.onmessage = (event: MessageEvent<BatchWorkerResponse<TResult, number>>) => {
        const response = event.data;
        if (response.id !== id) return;
        if (response.type === "progress") {
          onProgress?.(response.progress);
          return;
        }
        cleanup();
        if (response.type === "result") resolve(response.results);
        else reject(new Error(response.error));
      };
      this.worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message));
      };
      this.worker.postMessage({ id, tasks, context: this.context } satisfies BatchWorkerRequest<TTask, TContext>);
    });
  }

  close(): void {
    if (this.rejectInFlight) {
      this.rejectInFlight(new Error("Browser worker closed before completing in-flight batch"));
      this.rejectInFlight = undefined;
    }
    this.worker.terminate();
  }
}

export class BrowserBatchRunner<TTask, TResult, TContext = undefined> {
  private pool?: BatchWorkerPool<TTask, TResult, number>;
  private closed = false;

  constructor(
    private readonly jobs: number,
    private readonly createWorker: () => Worker,
    private readonly context?: TContext,
  ) {}

  async run(tasks: TTask[], options: RunTasksOptions<TTask> = {}): Promise<TResult[]> {
    if (this.closed) throw new Error("Browser batch runner is closed");
    if (tasks.length === 0) return [];
    const getWeight = options.getWeight ?? (() => 1);
    const totalWeight = tasks.reduce((sum, task) => sum + normalizedWeight(getWeight(task)), 0);
    const workerCount = Math.max(1, Math.min(Math.floor(this.jobs), tasks.length));
    const targetBatchWeight = options.targetBatchWeight
      ?? Math.max(1, Math.ceil(totalWeight / workerCount));
    const batches = batchTasksByWeight(tasks, targetBatchWeight, getWeight);
    const batchProgress = Array.from({ length: batches.length }, () => 0);
    const pool = this.getPool();
    return pool.runBatches(batches, (batchIndex, progress) => {
      if (options.progressMode === "incremental") {
        options.onProgress?.(progress, totalWeight);
        return;
      }
      batchProgress[batchIndex] = progress;
      options.onProgress?.(batchProgress.reduce((sum, value) => sum + value, 0), totalWeight);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool?.close();
  }

  private getPool(): BatchWorkerPool<TTask, TResult, number> {
    this.pool ??= new BatchWorkerPool(
      Math.max(1, Math.floor(this.jobs)),
      () => new BrowserBatchWorker(this.createWorker(), this.context),
    );
    return this.pool;
  }
}

export function installBrowserBatchHandler<TTask, TResult, TContext = undefined>(
  runBatch: RunBatch<TTask, TResult, TContext>,
): void {
  self.onmessage = (event: MessageEvent<BatchWorkerRequest<TTask, TContext>>) => {
    const request = event.data;
    void Promise.resolve(runBatch(
      request.tasks,
      request.context,
      (progress) => self.postMessage({
        id: request.id,
        type: "progress",
        progress,
      } satisfies BatchWorkerResponse<TResult, number>),
    )).then(
      (results) => self.postMessage({
        id: request.id,
        type: "result",
        results,
      } satisfies BatchWorkerResponse<TResult, number>),
      (error) => self.postMessage({
        id: request.id,
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      } satisfies BatchWorkerResponse<TResult, number>),
    );
  };
}

function normalizedWeight(weight: number): number {
  return Math.max(1, Math.floor(weight));
}
