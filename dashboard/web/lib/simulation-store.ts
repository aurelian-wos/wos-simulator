import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import {
  buildSimulationShareUrl,
  type SavedSimulationKind,
  type SavedSimulationRequest,
  type SavedSimulationResult,
  type SavedSimulationRunDocument,
  type SavedSimulationRunResponse,
} from "@/lib/simulate-run";

const ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

export const SIM_RUNS_DIR =
  process.env.SIM_RUNS_DIR ??
  path.resolve(process.cwd(), "../../tmp/simulate-runs");

function runPath(id: string): string {
  if (!ID_RE.test(id)) {
    throw new Error(`Invalid saved simulation id: ${id}`);
  }
  return path.join(SIM_RUNS_DIR, `${id}.json`);
}

async function ensureStoreDir(): Promise<void> {
  await fs.mkdir(SIM_RUNS_DIR, { recursive: true });
}

function withShareUrl(
  doc: SavedSimulationRunDocument,
): SavedSimulationRunResponse {
  return {
    ...doc,
    share_url: buildSimulationShareUrl(doc.id),
  };
}

function assertSavedSimulationDoc(
  value: unknown,
): SavedSimulationRunDocument {
  if (!value || typeof value !== "object") {
    throw new Error("Saved simulation document is missing");
  }
  const doc = value as Partial<SavedSimulationRunDocument>;
  if (
    doc.version !== 1 ||
    typeof doc.id !== "string" ||
    !ID_RE.test(doc.id) ||
    (doc.kind !== "simulate" && doc.kind !== "optimize_ratio") ||
    typeof doc.created_at !== "string" ||
    doc.request === undefined ||
    doc.result === undefined
  ) {
    throw new Error("Saved simulation document is malformed");
  }
  return doc as SavedSimulationRunDocument;
}

export async function saveSimulationRun(
  kind: SavedSimulationKind,
  request: SavedSimulationRequest,
  result: SavedSimulationResult,
): Promise<SavedSimulationRunResponse> {
  await ensureStoreDir();

  const id = randomUUID();
  const doc: SavedSimulationRunDocument = {
    version: 1,
    id,
    kind,
    created_at: new Date().toISOString(),
    request,
    result,
  };

  const filePath = runPath(id);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
  return withShareUrl(doc);
}

export async function readSimulationRun(
  id: string,
): Promise<SavedSimulationRunResponse | null> {
  try {
    const raw = await fs.readFile(runPath(id), "utf8");
    return withShareUrl(assertSavedSimulationDoc(JSON.parse(raw)));
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}
