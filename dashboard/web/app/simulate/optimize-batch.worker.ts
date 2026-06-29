import { loadSimulatorConfig } from "@simulator/config";
import type { OptimizeRatioRequestPayload } from "@/lib/simulate-run";
import { runOptimizeBatchDirect, type OptimizeBatchResult, type OptimizeBatchTask } from "@/lib/simulator/optimise";

type OptimizeBatchRequest =
  | { id: number; type: "run"; payload: OptimizeRatioRequestPayload; tasks: OptimizeBatchTask[] }
  | { id: number; type: "cancel" };

type OptimizeBatchResponse =
  | { id: number; type: "progress"; done: number }
  | { id: number; type: "result"; data: OptimizeBatchResult[] }
  | { id: number; type: "error"; message: string };

let activeJobId: number | null = null;

self.onmessage = (event: MessageEvent<OptimizeBatchRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (activeJobId === request.id) activeJobId = null;
    return;
  }

  activeJobId = request.id;
  try {
    const config = loadSimulatorConfig();
    const results = runOptimizeBatchDirect(
      request.payload,
      request.tasks,
      config,
      undefined,
      (done) => postIfActive(request.id, { id: request.id, type: "progress", done }),
    );
    postIfActive(request.id, { id: request.id, type: "result", data: results });
  } catch (error) {
    postIfActive(request.id, {
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (activeJobId === request.id) activeJobId = null;
  }
};

function postIfActive(id: number, message: OptimizeBatchResponse): void {
  if (activeJobId !== id) return;
  self.postMessage(message);
}
