import { randomUUID } from "crypto";
import { mkdirSync, promises as fs } from "fs";
import path from "path";

import { resolveSimulatorRoot } from "@/lib/simulator-root";
import {
  buildSimulationShareUrl,
  buildSimulationRunTitle,
  isSavedSimulationKind,
  type SavedSimulationKind,
  type SavedSimulationRequest,
  type SavedSimulationResult,
  type SavedSimulationRunListItem,
  type SavedSimulationRunDocument,
  type SavedSimulationRunResponse,
} from "@/lib/simulate-run";

const ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const LIST_READ_BATCH_SIZE = 32;
const LIST_HEADER_CHUNK_SIZE = 64 * 1024;
const LIST_HEADER_LIMIT = 256 * 1024;
const RESULT_FIELD_MARKER = /,\r?\n  "result":/;

const listItemCache = new Map<
  string,
  { modifiedAt: number; item: SavedSimulationRunListItem }
>();

export const SIM_RUNS_DIR =
  process.env.SIM_RUNS_DIR ??
  path.join(resolveSimulatorRoot(), "tmp", "simulate-runs");

export interface SimulationRunListOptions {
  limit?: number;
  offset?: number;
  kinds?: readonly SavedSimulationKind[];
}

export interface SimulationRunListPage {
  runs: SavedSimulationRunListItem[];
  has_more: boolean;
  next_offset: number;
}

function runPath(id: string): string {
  if (!ID_RE.test(id)) {
    throw new Error(`Invalid saved simulation id: ${id}`);
  }
  return path.join(SIM_RUNS_DIR, `${id}.json`);
}

function withShareUrl(
  doc: SavedSimulationRunDocument,
): SavedSimulationRunResponse {
  return {
    ...doc,
    share_url: buildSimulationShareUrl(doc.id, doc.kind),
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
    !isSavedSimulationKind(doc.kind) ||
    typeof doc.created_at !== "string" ||
    doc.request === undefined ||
    doc.result === undefined
  ) {
    throw new Error("Saved simulation document is malformed");
  }
  return doc as SavedSimulationRunDocument;
}

function assertSavedSimulationListDoc(
  value: unknown,
): Omit<SavedSimulationRunDocument, "result"> {
  if (!value || typeof value !== "object") {
    throw new Error("Saved simulation document is missing");
  }
  const doc = value as Partial<SavedSimulationRunDocument>;
  if (
    doc.version !== 1 ||
    typeof doc.id !== "string" ||
    !ID_RE.test(doc.id) ||
    !isSavedSimulationKind(doc.kind) ||
    typeof doc.created_at !== "string" ||
    doc.request === undefined
  ) {
    throw new Error("Saved simulation document is malformed");
  }
  return doc as Omit<SavedSimulationRunDocument, "result">;
}

async function readSimulationRunListItem(
  filePath: string,
): Promise<SavedSimulationRunListItem> {
  const handle = await fs.open(filePath, "r");
  const chunks: Buffer[] = [];
  let bytesReadTotal = 0;
  let raw = "";

  try {
    while (bytesReadTotal < LIST_HEADER_LIMIT) {
      const chunk = Buffer.allocUnsafe(LIST_HEADER_CHUNK_SIZE);
      const { bytesRead } = await handle.read(
        chunk,
        0,
        chunk.length,
        bytesReadTotal,
      );
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      bytesReadTotal += bytesRead;
      raw = Buffer.concat(chunks).toString("utf8");
      if (RESULT_FIELD_MARKER.test(raw)) break;
    }
  } finally {
    await handle.close();
  }

  const marker = raw.match(RESULT_FIELD_MARKER);
  const value = marker
    ? JSON.parse(`${raw.slice(0, marker.index)}\n}`)
    : JSON.parse(await fs.readFile(filePath, "utf8"));
  const doc = assertSavedSimulationListDoc(value);
  return {
    id: doc.id,
    kind: doc.kind,
    created_at: doc.created_at,
    share_url: buildSimulationShareUrl(doc.id, doc.kind),
    title: buildSimulationRunTitle(doc.request, doc.kind),
  };
}

export async function saveSimulationRun(
  kind: SavedSimulationKind,
  request: SavedSimulationRequest,
  result: SavedSimulationResult,
): Promise<SavedSimulationRunResponse> {
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
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code !== "ENOENT") throw err;
    mkdirSync(SIM_RUNS_DIR, { recursive: true });
    await fs.writeFile(tempPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  }
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

export async function listSimulationRuns(
  limit = 20,
): Promise<SavedSimulationRunListItem[]> {
  return (await listSimulationRunsPage({ limit })).runs;
}

export async function listSimulationRunsPage(
  options: SimulationRunListOptions = {},
): Promise<SimulationRunListPage> {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const kindSet =
    options.kinds && options.kinds.length > 0
      ? new Set(options.kinds)
      : null;
  let entries;
  try {
    entries = await fs.readdir(SIM_RUNS_DIR, { withFileTypes: true });
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code !== "ENOENT") throw err;
    return { runs: [], has_more: false, next_offset: 0 };
  }
  const candidates = (
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          try {
            const stats = await fs.stat(path.join(SIM_RUNS_DIR, entry.name));
            return { name: entry.name, modifiedAt: stats.mtimeMs };
          } catch {
            return null;
          }
        }),
    )
  )
    .filter((candidate) => candidate !== null)
    .sort(
      (a, b) =>
        b.modifiedAt - a.modifiedAt || b.name.localeCompare(a.name),
    );

  const requiredCount = offset + limit + 1;
  const matchingRuns: SavedSimulationRunListItem[] = [];
  let start = 0;
  while (start < candidates.length && matchingRuns.length < requiredCount) {
    const batchSize = Math.min(
      LIST_READ_BATCH_SIZE,
      requiredCount - matchingRuns.length,
    );
    const batch = candidates.slice(start, start + batchSize);
    start += batch.length;
    const batchRuns = await Promise.all(
      batch.map(async (candidate) => {
        const cached = listItemCache.get(candidate.name);
        if (cached?.modifiedAt === candidate.modifiedAt) return cached.item;
        try {
          const item = await readSimulationRunListItem(
            path.join(SIM_RUNS_DIR, candidate.name),
          );
          listItemCache.set(candidate.name, {
            modifiedAt: candidate.modifiedAt,
            item,
          });
          return item;
        } catch {
          // Ignore partial or stale scratch files so one bad save does not
          // break the recent-run picker.
          return null;
        }
      }),
    );
    for (const run of batchRuns) {
      if (run && (!kindSet || kindSet.has(run.kind))) matchingRuns.push(run);
    }
  }

  const sorted = matchingRuns.sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const pageRuns = sorted.slice(offset, offset + limit);
  const page = {
    runs: pageRuns,
    has_more: sorted.length > offset + pageRuns.length,
    next_offset: offset + pageRuns.length,
  };
  return page;
}
