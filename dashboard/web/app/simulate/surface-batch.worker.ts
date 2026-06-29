import { loadSimulatorConfig } from "@simulator/config";
import { runPair, type SurfaceBatchResult, type SurfaceBatchTask } from "@/lib/simulator/surface";

type SurfaceBatchRequest =
  | { id: number; type: "run"; tasks: SurfaceBatchTask[] }
  | { id: number; type: "cancel" };

type SurfaceBatchResponse =
  | { id: number; type: "progress"; done: number }
  | { id: number; type: "result"; data: SurfaceBatchResult[] }
  | { id: number; type: "error"; message: string };

let activeJobId: number | null = null;

self.onmessage = (event: MessageEvent<SurfaceBatchRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (activeJobId === request.id) activeJobId = null;
    return;
  }

  activeJobId = request.id;
  try {
    const config = loadSimulatorConfig();
    const results: SurfaceBatchResult[] = [];
    let done = 0;
    for (const task of request.tasks) {
      if (activeJobId !== request.id) return;
      const winrate = runPair(
        task.attFighter,
        task.defFighter,
        task.replicates,
        `${task.seedBase}:${task.attIdx}:${task.defIdx}`,
        config,
      );
      results.push({ attIdx: task.attIdx, defIdx: task.defIdx, winrate });
      done += task.replicates;
      postIfActive(request.id, { id: request.id, type: "progress", done });
    }
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

function postIfActive(id: number, message: SurfaceBatchResponse): void {
  if (activeJobId !== id) return;
  self.postMessage(message);
}
