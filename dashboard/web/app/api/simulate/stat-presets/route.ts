import { NextRequest, NextResponse } from "next/server";

import {
  listPlayerStatPresets,
  savePlayerStatPreset,
  updatePlayerStatPreset,
} from "@/lib/stat-presets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ presets: await listPlayerStatPresets() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      name?: unknown;
      stats?: unknown;
    };
    const preset = body.id
      ? await updatePlayerStatPreset(body.id, {
          name: body.name,
          stats: body.stats,
        })
      : await savePlayerStatPreset({ name: body.name, stats: body.stats });
    return NextResponse.json({ preset });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.startsWith("No stat preset found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
