import { parentPort } from "node:worker_threads";

import { loadSimulatorConfig } from "../../simulator/src/config";
import { runSingleBattleDirect } from "./battleRunner";
import type { BattleTask } from "./types";

interface WorkerRequest {
  id: number;
  task?: BattleTask;
  tasks?: BattleTask[];
}

const config = loadSimulatorConfig();

function handleRequest(request: WorkerRequest): void {
  try {
    const tasks = request.tasks ?? (request.task ? [request.task] : []);
    const results = tasks.map((task) => runSingleBattleDirect(task, config));
    parentPort?.postMessage({ id: request.id, results });
  } catch (error) {
    const message = { id: request.id, error: error instanceof Error ? error.message : String(error) };
    parentPort?.postMessage(message);
  }
}

parentPort?.on("message", (request: unknown) => handleRequest(request as WorkerRequest));
