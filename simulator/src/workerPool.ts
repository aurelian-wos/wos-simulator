export interface BatchWorker<TTask, TResult, TProgress = never> {
  runBatch(id: number, tasks: TTask[], onProgress?: (progress: TProgress) => void): Promise<TResult[]>;
  close(): Promise<void> | void;
}

export interface BatchWorkerRequest<TTask, TContext = undefined> {
  id: number;
  tasks: TTask[];
  context?: TContext;
}

export type BatchWorkerResponse<TResult, TProgress = never> =
  | { id: number; type: "progress"; progress: TProgress }
  | { id: number; type: "result"; results: TResult[] }
  | { id: number; type: "error"; error: string };

interface PendingBatch<TTask, TResult, TProgress> {
  tasks: TTask[];
  onProgress?: (progress: TProgress) => void;
  resolve: (result: TResult[]) => void;
  reject: (error: Error) => void;
}

interface WorkerState<TTask, TResult, TProgress> {
  worker: BatchWorker<TTask, TResult, TProgress>;
  idle: boolean;
  closed: boolean;
  inFlight?: PendingBatch<TTask, TResult, TProgress>;
}

export class BatchWorkerPool<TTask, TResult, TProgress = never> {
  private readonly workers: WorkerState<TTask, TResult, TProgress>[];
  private readonly queue: PendingBatch<TTask, TResult, TProgress>[] = [];
  private nextId = 1;
  private closed = false;

  constructor(size: number, createWorker: (index: number) => BatchWorker<TTask, TResult, TProgress>) {
    const count = Math.max(1, Math.floor(size));
    this.workers = Array.from({ length: count }, (_, index) => ({
      worker: createWorker(index),
      idle: true,
      closed: false
    }));
  }

  runBatch(tasks: TTask[], onProgress?: (progress: TProgress) => void): Promise<TResult[]> {
    if (this.closed) return Promise.reject(new Error("Worker pool is closed"));
    return new Promise((resolve, reject) => {
      this.queue.push({ tasks, onProgress, resolve, reject });
      this.pump();
    });
  }

  async runTask(task: TTask, onProgress?: (progress: TProgress) => void): Promise<TResult> {
    const results = await this.runBatch([task], onProgress);
    const result = results[0];
    if (result === undefined) throw new Error("Worker returned no result for task");
    return result;
  }

  async runBatches(
    batches: readonly TTask[][],
    onProgress?: (batchIndex: number, progress: TProgress) => void,
  ): Promise<TResult[]> {
    const results = await Promise.all(
      batches.map((batch, batchIndex) => this.runBatch(
        batch,
        onProgress ? (progress) => onProgress(batchIndex, progress) : undefined,
      )),
    );
    return results.flat();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    while (this.queue.length > 0) this.queue.shift()!.reject(new Error("Worker pool closed before completing queued tasks"));
    await Promise.all(
      this.workers.map(async (state) => {
        state.closed = true;
        state.idle = false;
        if (state.inFlight) {
          state.inFlight.reject(new Error("Worker pool closed before completing in-flight task"));
          state.inFlight = undefined;
        }
        await state.worker.close();
      })
    );
  }

  private pump(): void {
    if (this.closed) return;
    for (const state of this.workers) {
      if (!state.idle || state.closed) continue;
      const pending = this.queue.shift();
      if (!pending) return;
      const id = this.nextId;
      this.nextId += 1;
      state.idle = false;
      state.inFlight = pending;
      void state.worker.runBatch(id, pending.tasks, pending.onProgress).then(
        (result) => {
          if (state.inFlight !== pending) return;
          state.inFlight = undefined;
          state.idle = true;
          pending.resolve(result);
          this.pump();
        },
        (error) => {
          if (state.inFlight !== pending) return;
          state.inFlight = undefined;
          state.idle = true;
          pending.reject(error instanceof Error ? error : new Error(String(error)));
          this.pump();
        }
      );
    }
  }
}

export function batchTasksByWeight<TTask>(
  tasks: TTask[],
  targetWeight: number,
  getWeight: (task: TTask) => number
): TTask[][] {
  const batches: TTask[][] = [];
  const maxWeight = Math.max(1, Math.floor(targetWeight));
  let current: TTask[] = [];
  let currentWeight = 0;
  for (const task of tasks) {
    const taskWeight = Math.max(1, Math.floor(getWeight(task)));
    if (current.length > 0 && currentWeight + taskWeight > maxWeight) {
      batches.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(task);
    currentWeight += taskWeight;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
