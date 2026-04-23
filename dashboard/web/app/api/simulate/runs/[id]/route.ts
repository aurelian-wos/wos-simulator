import { NextResponse } from "next/server";

import { readSimulationRun } from "@/lib/simulation-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const saved = await readSimulationRun(id);
    if (!saved) {
      return NextResponse.json(
        { error: `No saved simulation found for ${id}` },
        { status: 404 },
      );
    }
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }
}
