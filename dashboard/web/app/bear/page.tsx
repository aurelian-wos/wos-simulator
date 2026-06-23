import BearSimClient from "./BearSimClient";
import { readSimulationRun } from "@/lib/simulation-store";
import { isBearSavedSimulationKind, type SavedSimulationRunResponse } from "@/lib/simulate-run";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ run?: string }>;
}

export default async function BearPage({ searchParams }: PageProps) {
  const { run } = await searchParams;
  let initialSavedRun: SavedSimulationRunResponse | null = null;
  let initialSavedRunError: string | null = null;

  if (run) {
    try {
      const saved = await readSimulationRun(run);
      if (!saved) {
        initialSavedRunError = `No saved bear run found for ${run}`;
      } else if (!isBearSavedSimulationKind(saved.kind)) {
        initialSavedRunError = `Saved run ${run} belongs to the PvP simulator.`;
      } else {
        initialSavedRun = saved;
      }
    } catch (err) {
      initialSavedRunError =
        err instanceof Error ? err.message : "Failed to load saved run";
    }
  }

  return (
    <BearSimClient
      initialRunId={run ?? null}
      initialSavedRun={initialSavedRun}
      initialSavedRunError={initialSavedRunError}
    />
  );
}
