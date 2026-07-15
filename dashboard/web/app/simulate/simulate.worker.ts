import { runOptimizeRatio, runOptimizeBatchDirect, type OptimizeBatchResult, type OptimizeBatchTask, type OptimizeStageTiming } from "@/lib/simulator/optimise";
import { runBearOptimizeRatio, runBearSimulation, runBearSimulationTrace } from "@/lib/simulator/bear";
import { runSimulation, runSimulationBatchDirect, runSimulationTrace, type SimulateBatchResult, type SimulateBatchTask } from "@/lib/simulator/simulate";
import { runProgressiveSurfaceSweep, runPair, type SurfaceBatchResult, type SurfaceBatchTask } from "@/lib/simulator/surface";
import { loadSimulatorConfig } from "@simulator/config";
import type { SimulatorWorkerRequest, SimulatorWorkerResponse } from "@/lib/simulator/worker-protocol";
import { runBattleTasksDirect, runTournament, type BattleSummary, type BattleTask, type TournamentRunOptions } from "@/lib/tournament";
import type { SimulatorConfig } from "@simulator/types";
import { BatchWorkerPool, batchTasksByWeight, type BatchWorker } from "@simulator/workerPool";
import type { OptimizeRatioRequestPayload, SimulateRequestPayload } from "@/lib/simulate-run";
import { recommendedBrowserWorkerCount } from "@/lib/simulator/worker-count";

let activeJobId: number | null = null;
let activeSimulateWorkers: Worker[] = [];
let activeOptimizeWorkers: Worker[] = [];
let activeTournamentPool: BatchWorkerPool<BattleTask, BattleSummary, number> | null = null;
let activeSurfaceWorkers: Worker[] = [];
const AVAILABLE_PROCESSORS = Math.max(1, self.navigator.hardwareConcurrency || 1);
const BATTLE_WORKER_COUNT = recommendedBrowserWorkerCount(AVAILABLE_PROCESSORS);
const TOURNAMENT_BATCH_WEIGHT = 64;

self.onmessage = (event: MessageEvent<SimulatorWorkerRequest>) => {
  void handleMessage(event.data);
};

async function handleMessage(request: SimulatorWorkerRequest): Promise<void> {
  if (request.type === "cancel") {
    if (activeJobId === request.id) activeJobId = null;
    for (const worker of activeSimulateWorkers) worker.terminate();
    activeSimulateWorkers = [];
    for (const worker of activeOptimizeWorkers) worker.terminate();
    activeOptimizeWorkers = [];
    await activeTournamentPool?.close();
    activeTournamentPool = null;
    for (const worker of activeSurfaceWorkers) worker.terminate();
    activeSurfaceWorkers = [];
    return;
  }
  activeJobId = request.id;
  try {
    if (request.type === "simulate") {
      const data = await runSimulation(request.payload, {
        seedBase: `simulate:${request.id}`,
        onProgress: (done, total) => postIfActive(request.id, { id: request.id, type: "progress", done, total }),
        runBatches: createSimulateBatchRunner(request.id, BATTLE_WORKER_COUNT),
      });
      postIfActive(request.id, { id: request.id, type: "simulateResult", data });
    } else if (request.type === "simulateTrace") {
      const data = runSimulationTrace(request.payload, request.seed, {
        onProgress: (done, total) => postIfActive(request.id, { id: request.id, type: "progress", done, total }),
      });
      postIfActive(request.id, { id: request.id, type: "simulateTraceResult", data });
    } else if (request.type === "bearSim") {
      const data = runBearSimulation(request.payload, {
        seedBase: `bear:${request.id}`,
        onProgress: (done, total) => postIfActive(request.id, { id: request.id, type: "progress", done, total }),
      });
      postIfActive(request.id, { id: request.id, type: "bearResult", data });
    } else if (request.type === "bearTrace") {
      const data = runBearSimulationTrace(request.payload, request.seed, {
        onProgress: (done, total) => postIfActive(request.id, { id: request.id, type: "progress", done, total }),
      });
      postIfActive(request.id, { id: request.id, type: "bearTraceResult", data });
    } else if (request.type === "bearOptimize") {
      const data = runBearOptimizeRatio(request.payload, {
        seedBase: `bear-optimize:${request.id}`,
        onProgress: (done, total) => postIfActive(request.id, { id: request.id, type: "progress", done, total }),
      });
      postIfActive(request.id, { id: request.id, type: "bearOptimizeResult", data });
    } else if (request.type === "optimizeRatio") {
      const optimizeStartedAt = performance.now();
      let totalWorkerMs = 0;
      const data = await runOptimizeRatio(request.payload, {
        seedBase: `optimize:${request.id}`,
        onProgress: (done, total) => postIfActive(request.id, { id: request.id, type: "progress", done, total }),
        onStageTiming: (timing) => {
          const activeWorkers = optimizeWorkerCount(timing.compositions);
          totalWorkerMs += timing.totalMs * activeWorkers;
          logOptimizeStageTiming(timing, activeWorkers);
        },
        runBatches: createOptimizeBatchRunner(request.id, BATTLE_WORKER_COUNT),
      });
      const totalMs = performance.now() - optimizeStartedAt;
      console.info(
        `[optimise] total: ${data.compositions_tested.toLocaleString()} ratios, ${data.projected_battles.toLocaleString()} simulations; ` +
        `${formatDuration(totalMs)} wall time; ${formatAverage(totalWorkerMs, data.projected_battles)} worker-normalized/simulation; ` +
        `${BATTLE_WORKER_COUNT.toLocaleString()} workers from ${AVAILABLE_PROCESSORS.toLocaleString()} available processors`,
      );
      postIfActive(request.id, { id: request.id, type: "optimizeResult", data });
    } else if (request.type === "progressiveSurfaceSweep") {
      const data = await runProgressiveSurfaceSweep(request.payload, {
        seedBase: `surface:${request.id}`,
        onProgress: (done, total) => postIfActive(request.id, { id: request.id, type: "progress", done, total }),
        onStage: (stage) => postIfActive(request.id, { id: request.id, type: "surfaceStage", data: stage }),
        runBatches: request.payload.jobs > 1
          ? createSurfaceBatchRunner(request.id, request.payload.jobs)
          : undefined,
      });
      postIfActive(request.id, { id: request.id, type: "surfaceResult", data });
    } else {
      const tournamentRunner = request.payload.jobs > 1
        ? createTournamentWorkerPoolRunner(request.payload.jobs)
        : null;
      try {
        const data = await runTournament(request.payload, {
          seedBase: `tournament:${request.id}`,
          onProgress: (done, total) => postIfActive(request.id, { id: request.id, type: "progress", done, total }),
          runBattleTasks: tournamentRunner?.runBattleTasks,
        });
        postIfActive(request.id, { id: request.id, type: "tournamentResult", data });
      } finally {
        await tournamentRunner?.close();
      }
    }
  } catch (error) {
    postIfActive(request.id, { id: request.id, type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    if (activeJobId === request.id) activeJobId = null;
  }
}

function logOptimizeStageTiming(
  timing: OptimizeStageTiming,
  activeWorkers: number,
): void {
  const workerNormalizedMs = timing.totalMs * activeWorkers;
  console.info(
    `[optimise] ${timing.stage}: ${timing.compositions.toLocaleString()} ratios × ` +
    `${timing.replicatesPerComposition.toLocaleString()} reps = ${timing.simulations.toLocaleString()} simulations; ` +
    `${formatDuration(timing.totalMs)} wall time; ${formatAverage(workerNormalizedMs, timing.simulations)} worker-normalized/simulation; ` +
    `${activeWorkers.toLocaleString()} active workers`,
  );
}

function optimizeWorkerCount(compositions: number): number {
  return Math.max(1, Math.min(BATTLE_WORKER_COUNT, compositions));
}

function formatDuration(milliseconds: number): string {
  return milliseconds >= 1_000
    ? `${(milliseconds / 1_000).toFixed(2)} s`
    : `${milliseconds.toFixed(1)} ms`;
}

function formatAverage(totalMs: number, count: number): string {
  return `${(totalMs / Math.max(1, count)).toFixed(3)} ms`;
}

function postIfActive(id: number, message: SimulatorWorkerResponse): void {
  if (activeJobId !== id) return;
  self.postMessage(message);
}

function createSimulateBatchRunner(
  parentJobId: number,
  jobs: number,
): (payload: SimulateRequestPayload, tasks: SimulateBatchTask[], onProgress?: (done: number, total: number) => void) => Promise<SimulateBatchResult[]> {
  return async (payload, tasks, onProgress) => {
    if (tasks.length === 0) return [];
    const workerCount = Math.max(1, Math.min(Math.floor(jobs), tasks.length));
    if (workerCount <= 1) {
      const config = loadSimulatorConfig();
      return runSimulationBatchDirect(payload, tasks, config, onProgress);
    }
    const chunks = chunkTasks(tasks, workerCount);
    const workers = chunks.map(() => new Worker(new URL("./simulate-batch.worker.ts", import.meta.url), { type: "module" }));
    const chunkDone = Array.from({ length: chunks.length }, () => 0);
    const total = tasks.length;
    const reportChunkProgress = (chunkIndex: number, done: number) => {
      chunkDone[chunkIndex] = done;
      onProgress?.(chunkDone.reduce((sum, value) => sum + value, 0), total);
    };
    activeSimulateWorkers = workers;
    try {
      const resultSets = await Promise.all(
        chunks.map((chunk, index) => runSimulateBatchChunk(workers[index], parentJobId, index, payload, chunk, (done) => reportChunkProgress(index, done))),
      );
      return resultSets.flat();
    } finally {
      for (const worker of workers) worker.terminate();
      activeSimulateWorkers = activeSimulateWorkers.filter((worker) => !workers.includes(worker));
    }
  };
}

function runSimulateBatchChunk(
  worker: Worker,
  parentJobId: number,
  chunkIndex: number,
  payload: SimulateRequestPayload,
  tasks: SimulateBatchTask[],
  onProgress?: (done: number) => void,
): Promise<SimulateBatchResult[]> {
  const id = parentJobId * 10000 + chunkIndex + 1;
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ id: number; type: "progress" | "result" | "error"; done?: number; data?: SimulateBatchResult[]; message?: string }>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === "result") resolve(msg.data ?? []);
      else if (msg.type === "progress") onProgress?.(msg.done ?? 0);
      else if (msg.type === "error") reject(new Error(msg.message ?? "Simulate batch worker failed"));
    };
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage({ id, type: "run", payload, tasks });
  });
}

function createOptimizeBatchRunner(
  parentJobId: number,
  jobs: number,
): (payload: OptimizeRatioRequestPayload, tasks: OptimizeBatchTask[], onProgress?: (done: number, total: number) => void) => Promise<OptimizeBatchResult[]> {
  return async (payload, tasks, onProgress) => {
    if (tasks.length === 0) return [];
    const workerCount = Math.max(1, Math.min(Math.floor(jobs), tasks.length));
    if (workerCount <= 1) {
      const config = loadSimulatorConfig();
      return runOptimizeBatchDirect(payload, tasks, config, undefined, onProgress);
    }
    const chunks = chunkTasks(tasks, workerCount);
    const workers = chunks.map(() => new Worker(new URL("./optimize-batch.worker.ts", import.meta.url), { type: "module" }));
    const chunkDone = Array.from({ length: chunks.length }, () => 0);
    const total = tasks.length;
    const reportChunkProgress = (chunkIndex: number, done: number) => {
      chunkDone[chunkIndex] = done;
      onProgress?.(chunkDone.reduce((sum, value) => sum + value, 0), total);
    };
    activeOptimizeWorkers = workers;
    try {
      const resultSets = await Promise.all(
        chunks.map((chunk, index) => runOptimizeBatchChunk(workers[index], parentJobId, index, payload, chunk, (done) => reportChunkProgress(index, done))),
      );
      return resultSets.flat();
    } finally {
      for (const worker of workers) worker.terminate();
      activeOptimizeWorkers = activeOptimizeWorkers.filter((worker) => !workers.includes(worker));
    }
  };
}

function runOptimizeBatchChunk(
  worker: Worker,
  parentJobId: number,
  chunkIndex: number,
  payload: OptimizeRatioRequestPayload,
  tasks: OptimizeBatchTask[],
  onProgress?: (done: number) => void,
): Promise<OptimizeBatchResult[]> {
  const id = parentJobId * 10000 + chunkIndex + 1;
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ id: number; type: "progress" | "result" | "error"; done?: number; data?: OptimizeBatchResult[]; message?: string }>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === "result") resolve(msg.data ?? []);
      else if (msg.type === "progress") onProgress?.(msg.done ?? 0);
      else if (msg.type === "error") reject(new Error(msg.message ?? "Optimize batch worker failed"));
    };
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage({ id, type: "run", payload, tasks });
  });
}

function createTournamentWorkerPoolRunner(jobs: number): {
  runBattleTasks: NonNullable<TournamentRunOptions["runBattleTasks"]>;
  close(): Promise<void>;
} {
  const workerCount = Math.max(1, Math.floor(jobs));
  const pool = new BatchWorkerPool<BattleTask, BattleSummary, number>(
    workerCount,
    () => new BrowserTournamentWorker()
  );
  activeTournamentPool = pool;
  return {
    async runBattleTasks(tasks: BattleTask[], _config: SimulatorConfig, onBattleDone: (battleReps: number) => void): Promise<BattleSummary[]> {
      if (tasks.length === 0) return [];
      const activeWorkerCount = Math.max(1, Math.min(Math.floor(jobs), tasks.length));
      if (activeWorkerCount <= 1) return runBattleTasksDirect(tasks, _config, onBattleDone);
      const results: BattleSummary[] = new Array(tasks.length);
      let offset = 0;
      const batches = batchTasksByWeight(tasks, TOURNAMENT_BATCH_WEIGHT, (task) => task.reps).map((batch) => {
        const start = offset;
        offset += batch.length;
        return { batch, start };
      });
      await Promise.all(
        batches.map(async ({ batch, start }) => {
          const batchResults = await pool.runBatch(batch, onBattleDone);
          results.splice(start, batchResults.length, ...batchResults);
        })
      );
      return results;
    },
    async close(): Promise<void> {
      await pool.close();
      if (activeTournamentPool === pool) activeTournamentPool = null;
    }
  };
}

class BrowserTournamentWorker implements BatchWorker<BattleTask, BattleSummary, number> {
  private readonly worker = new Worker(new URL("./tournament-battle.worker.ts", import.meta.url), { type: "module" });
  private rejectInFlight?: (error: Error) => void;

  runBatch(id: number, tasks: BattleTask[], onProgress?: (battleReps: number) => void): Promise<BattleSummary[]> {
    if (this.rejectInFlight) return Promise.reject(new Error("Tournament worker already has an in-flight batch"));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.rejectInFlight = undefined;
        this.worker.onmessage = null;
        this.worker.onerror = null;
      };
      this.rejectInFlight = reject;
      this.worker.onmessage = (event: MessageEvent<{ id: number; type: "progress" | "result" | "error"; battleReps?: number; data?: BattleSummary[]; message?: string }>) => {
        const message = event.data;
        if (message.id !== id) return;
        if (message.type === "progress") {
          onProgress?.(message.battleReps ?? 0);
          return;
        }
        cleanup();
        if (message.type === "result") resolve(message.data ?? []);
        else reject(new Error(message.message ?? "Tournament battle worker failed"));
      };
      this.worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message));
      };
      this.worker.postMessage({ id, type: "run", tasks });
    });
  }

  close(): void {
    if (this.rejectInFlight) {
      this.rejectInFlight(new Error("Tournament worker closed before completing in-flight batch"));
      this.rejectInFlight = undefined;
    }
    this.worker.terminate();
  }
}

function chunkTasks<T>(tasks: T[], workerCount: number): T[][] {
  const chunks: T[][] = Array.from({ length: workerCount }, () => []);
  tasks.forEach((task, index) => chunks[index % workerCount].push(task));
  return chunks.filter((chunk) => chunk.length > 0);
}

function createSurfaceBatchRunner(
  parentJobId: number,
  jobs: number,
): (tasks: SurfaceBatchTask[], onProgress?: (done: number, total: number) => void) => Promise<SurfaceBatchResult[]> {
  return async (tasks: SurfaceBatchTask[], onProgress?: (done: number, total: number) => void): Promise<SurfaceBatchResult[]> => {
    if (tasks.length === 0) return [];
    const workerCount = Math.max(1, Math.min(Math.floor(jobs), tasks.length));
    if (workerCount <= 1) return runSurfaceBatchDirect(tasks, onProgress);
    const chunkSize = Math.ceil(tasks.length / workerCount);
    const chunks: SurfaceBatchTask[][] = [];
    for (let i = 0; i < tasks.length; i += chunkSize) chunks.push(tasks.slice(i, i + chunkSize));
    const workers = chunks.map(() => new Worker(new URL("./surface-batch.worker.ts", import.meta.url), { type: "module" }));
    const chunkDone = Array.from({ length: chunks.length }, () => 0);
    const total = tasks.reduce((sum, task) => sum + task.replicates, 0);
    const reportChunkProgress = (chunkIndex: number, done: number) => {
      chunkDone[chunkIndex] = done;
      onProgress?.(chunkDone.reduce((sum, value) => sum + value, 0), total);
    };
    activeSurfaceWorkers = workers;
    try {
      const resultSets = await Promise.all(
        chunks.map((chunk, index) => runSurfaceBatchChunk(workers[index], parentJobId, index, chunk, (done) => reportChunkProgress(index, done))),
      );
      return resultSets.flat();
    } finally {
      for (const worker of workers) worker.terminate();
      activeSurfaceWorkers = activeSurfaceWorkers.filter((w) => !workers.includes(w));
    }
  };
}

function runSurfaceBatchChunk(
  worker: Worker,
  parentJobId: number,
  chunkIndex: number,
  tasks: SurfaceBatchTask[],
  onProgress?: (done: number) => void,
): Promise<SurfaceBatchResult[]> {
  const id = parentJobId * 10000 + chunkIndex + 1;
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ id: number; type: "progress" | "result" | "error"; done?: number; data?: SurfaceBatchResult[]; message?: string }>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.type === "result") resolve(msg.data ?? []);
      else if (msg.type === "progress") onProgress?.(msg.done ?? 0);
      else if (msg.type === "error") reject(new Error(msg.message ?? "Surface batch worker failed"));
    };
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage({ id, type: "run", tasks });
  });
}

function runSurfaceBatchDirect(
  tasks: SurfaceBatchTask[],
  onProgress?: (done: number, total: number) => void,
): Promise<SurfaceBatchResult[]> {
  const config = loadSimulatorConfig();
  const total = tasks.reduce((sum, task) => sum + task.replicates, 0);
  let done = 0;
  return Promise.resolve(tasks.map((t) => {
    const winrate = runPair(t.attFighter, t.defFighter, t.replicates, `${t.seedBase}:${t.attIdx}:${t.defIdx}`, config);
    done += t.replicates;
    onProgress?.(done, total);
    return { attIdx: t.attIdx, defIdx: t.defIdx, winrate };
  }));
}
