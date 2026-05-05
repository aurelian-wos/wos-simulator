import { NextResponse } from "next/server";

import { listSimulationRuns } from "@/lib/simulation-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const runs = await listSimulationRuns(Number.isFinite(limit) ? limit : 20);
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
