import { loadSimulatorConfig } from "@simulator/config";
import { runSingleBattleDirect, type BattleSummary, type BattleTask } from "@/lib/tournament";

type TournamentBattleWorkerRequest =
  | { id: number; type: "run"; tasks: BattleTask[] }
  | { id: number; type: "cancel" };

type TournamentBattleWorkerResponse =
  | { id: number; type: "progress"; battleReps: number }
  | { id: number; type: "result"; data: BattleSummary[] }
  | { id: number; type: "error"; message: string };

let activeJobId: number | null = null;

self.onmessage = (event: MessageEvent<TournamentBattleWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (activeJobId === request.id) activeJobId = null;
    return;
  }

  activeJobId = request.id;
  try {
    const config = loadSimulatorConfig();
    const results: BattleSummary[] = [];
    for (const task of request.tasks) {
      if (activeJobId !== request.id) return;
      results.push(runSingleBattleDirect(task, config, (battleReps) => {
        postIfActive(request.id, { id: request.id, type: "progress", battleReps });
      }));
    }
    postIfActive(request.id, { id: request.id, type: "result", data: results });
  } catch (error) {
    postIfActive(request.id, { id: request.id, type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    if (activeJobId === request.id) activeJobId = null;
  }
};

function postIfActive(id: number, message: TournamentBattleWorkerResponse): void {
  if (activeJobId !== id) return;
  self.postMessage(message);
}
