import { loadSimulatorConfig } from "@simulator/config";
import type { SimulateRequestPayload } from "@/lib/simulate-run";
import { runSimulationBatchDirect, type SimulateBatchResult, type SimulateBatchTask } from "@/lib/simulator/simulate";

type SimulateBatchRequest =
  | { id: number; type: "run"; payload: SimulateRequestPayload; tasks: SimulateBatchTask[] }
  | { id: number; type: "cancel" };

type SimulateBatchResponse =
  | { id: number; type: "progress"; done: number }
  | { id: number; type: "result"; data: SimulateBatchResult[] }
  | { id: number; type: "error"; message: string };

let activeJobId: number | null = null;

self.onmessage = (event: MessageEvent<SimulateBatchRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (activeJobId === request.id) activeJobId = null;
    return;
  }

  activeJobId = request.id;
  try {
    const config = loadSimulatorConfig();
    const results = runSimulationBatchDirect(
      request.payload,
      request.tasks,
      config,
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

function postIfActive(id: number, message: SimulateBatchResponse): void {
  if (activeJobId !== id) return;
  self.postMessage(message);
}
