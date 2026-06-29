import SurfaceClient from "./SurfaceClient";
import { readSimulationRun } from "@/lib/simulation-store";
import { isSurfaceSavedSimulationKind, type SavedSimulationRunResponse } from "@/lib/simulate-run";

export const metadata = { title: "Ratio Explorer - WOS Simulator" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ run?: string }>;
}

export default async function SurfacePage({ searchParams }: PageProps) {
  const { run } = await searchParams;
  let initialSavedRun: SavedSimulationRunResponse | null = null;
  let initialSavedRunError: string | null = null;

  if (run) {
    try {
      const saved = await readSimulationRun(run);
      if (!saved) {
        initialSavedRunError = `No saved surface found for ${run}`;
      } else if (!isSurfaceSavedSimulationKind(saved.kind)) {
        initialSavedRunError = `Saved run ${run} does not belong to Ratio Explorer.`;
      } else {
        initialSavedRun = saved;
      }
    } catch (err) {
      initialSavedRunError =
        err instanceof Error ? err.message : "Failed to load saved surface";
    }
  }

  return (
    <SurfaceClient
      initialRunId={run ?? null}
      initialSavedRun={initialSavedRun}
      initialSavedRunError={initialSavedRunError}
    />
  );
}
