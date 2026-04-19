import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { parsePatch, applyPatch, createTwoFilesPatch, formatPatch } from "diff";

export function normalizeName(s: string | undefined): string {
  return (s ?? "").replace(/^[ab]\//, "");
}

export function reconstructBefore(parsed: ReturnType<typeof parsePatch>[0]): string {
  const lines: string[] = [];
  for (const hunk of parsed.hunks ?? []) {
    for (const line of hunk.lines) {
      if (line[0] === " " || line[0] === "-") lines.push(line.slice(1));
    }
  }
  return lines.join("\n");
}

export function computeIncrementalDiff(prevPatch: string, currPatch: string): string {
  const parsedPrev = parsePatch(prevPatch);
  const parsedCurr = parsePatch(currPatch);

  const mapPrev = new Map(
    parsedPrev.map((p) => [normalizeName(p.newFileName || p.oldFileName), p])
  );
  const mapCurr = new Map(
    parsedCurr.map((p) => [normalizeName(p.newFileName || p.oldFileName), p])
  );

  const parts: string[] = [];

  for (const [name, filePrev] of mapPrev) {
    const fileCurr = mapCurr.get(name);
    if (!fileCurr) continue;
    mapCurr.delete(name);

    const before = reconstructBefore(filePrev);
    const stateA = applyPatch(before, filePrev);
    const stateB = applyPatch(before, fileCurr);

    if (stateA === false || stateB === false) {
      parts.push(formatPatch([fileCurr]));
      continue;
    }
    if (stateA !== stateB) {
      parts.push(
        createTwoFilesPatch(name, name, stateA, stateB, "prev run", "this run")
      );
    }
  }

  for (const [, fileCurr] of mapCurr) {
    parts.push(formatPatch([fileCurr]));
  }

  return parts.join("\n");
}

export function resolveRepoRoot(): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out) return out;
  } catch {
    // fall through to filesystem walk
  }
  let dir = process.cwd();
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

export function isShaReachable(sha: string, repoRoot: string): boolean {
  if (!sha) return false;
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      cwd: repoRoot,
      timeout: 3000,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function readFileAtSha(
  sha: string,
  file: string,
  repoRoot: string
): string | null {
  try {
    const out = execFileSync("git", ["show", `${sha}:${file}`], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out;
  } catch {
    return null;
  }
}

export interface CrossShaDiffResult {
  patch: string;
  prevShaReachable: boolean;
  currShaReachable: boolean;
  totalFileCount: number;
  reconstructedFromBaselineCount: number;
  degradedFileCount: number;
}

type ParsedPatch = ReturnType<typeof parsePatch>[0];

function reconstructDirtyState(
  file: ParsedPatch,
  sha: string,
  name: string,
  repoRoot: string | null,
  shaReachable: boolean
): { state: string | null; usedBaseline: boolean } {
  if (shaReachable && repoRoot) {
    const baseline = readFileAtSha(sha, name, repoRoot);
    if (baseline !== null) {
      const applied = applyPatch(baseline, file);
      if (typeof applied === "string") {
        return { state: applied, usedBaseline: true };
      }
    }
  }
  // Fallback: reconstruct from patch alone (same-baseline assumption)
  const before = reconstructBefore(file);
  const applied = applyPatch(before, file);
  return {
    state: typeof applied === "string" ? applied : null,
    usedBaseline: false,
  };
}

function readBaselineState(
  sha: string,
  name: string,
  repoRoot: string | null,
  shaReachable: boolean
): { state: string | null; usedBaseline: boolean } {
  if (shaReachable && repoRoot) {
    const content = readFileAtSha(sha, name, repoRoot);
    if (content !== null) return { state: content, usedBaseline: true };
  }
  return { state: null, usedBaseline: false };
}

/**
 * Reconstruct the dirty-state diff between two runs even when their git SHAs differ.
 *
 * For each file changed in either run, we reconstruct the dirty-state contents on
 * both sides (baseline-at-sha + applied patch) and emit a two-files diff when the
 * contents differ. When a SHA is no longer in git (rebased/amended away), we fall
 * back to the same-baseline reconstruction used by `computeIncrementalDiff` and
 * mark the file as best-effort.
 */
export function computeCrossShaDiff(
  prevPatch: string,
  prevSha: string,
  currPatch: string,
  currSha: string,
  repoRoot: string | null
): CrossShaDiffResult {
  const prevShaReachable =
    repoRoot != null && isShaReachable(prevSha, repoRoot);
  const currShaReachable =
    repoRoot != null && isShaReachable(currSha, repoRoot);

  const parsedPrev = parsePatch(prevPatch);
  const parsedCurr = parsePatch(currPatch);

  const mapPrev = new Map<string, ParsedPatch>();
  for (const p of parsedPrev) {
    const n = normalizeName(p.newFileName || p.oldFileName);
    if (n) mapPrev.set(n, p);
  }
  const mapCurr = new Map<string, ParsedPatch>();
  for (const p of parsedCurr) {
    const n = normalizeName(p.newFileName || p.oldFileName);
    if (n) mapCurr.set(n, p);
  }

  const names = new Set<string>([...mapPrev.keys(), ...mapCurr.keys()]);

  const parts: string[] = [];
  let reconstructedFromBaselineCount = 0;
  let degradedFileCount = 0;

  for (const name of names) {
    const filePrev = mapPrev.get(name);
    const fileCurr = mapCurr.get(name);

    let prevState: string | null = null;
    let prevUsedBaseline = false;
    if (filePrev) {
      const r = reconstructDirtyState(
        filePrev,
        prevSha,
        name,
        repoRoot,
        prevShaReachable
      );
      prevState = r.state;
      prevUsedBaseline = r.usedBaseline;
    } else {
      const r = readBaselineState(prevSha, name, repoRoot, prevShaReachable);
      prevState = r.state;
      prevUsedBaseline = r.usedBaseline;
    }

    let currState: string | null = null;
    let currUsedBaseline = false;
    if (fileCurr) {
      const r = reconstructDirtyState(
        fileCurr,
        currSha,
        name,
        repoRoot,
        currShaReachable
      );
      currState = r.state;
      currUsedBaseline = r.usedBaseline;
    } else {
      const r = readBaselineState(currSha, name, repoRoot, currShaReachable);
      currState = r.state;
      currUsedBaseline = r.usedBaseline;
    }

    if (prevUsedBaseline && currUsedBaseline) reconstructedFromBaselineCount++;
    const degraded =
      (filePrev && !prevUsedBaseline) || (fileCurr && !currUsedBaseline);
    if (degraded) degradedFileCount++;

    if (prevState !== null && currState !== null) {
      if (prevState !== currState) {
        const headerPrev = degraded ? `${name} (baseline unreachable)` : name;
        parts.push(
          createTwoFilesPatch(
            headerPrev,
            name,
            prevState,
            currState,
            "prev run",
            "this run"
          )
        );
      }
      continue;
    }

    // One side has no state at all (only possible when file was unmodified on
    // that side AND baseline was unreachable). Emit the one patch we have so
    // the reviewer still sees *something*.
    if (filePrev && !fileCurr) {
      parts.push(formatPatch([filePrev]));
    } else if (fileCurr && !filePrev) {
      parts.push(formatPatch([fileCurr]));
    } else if (filePrev && fileCurr) {
      // Both present, but reconstruction failed on one side — fall back to raw
      // curr patch rather than nothing.
      parts.push(formatPatch([fileCurr]));
    }
  }

  return {
    patch: parts.join("\n"),
    prevShaReachable,
    currShaReachable,
    totalFileCount: names.size,
    reconstructedFromBaselineCount,
    degradedFileCount,
  };
}

export function formatCrossShaBanner(
  result: CrossShaDiffResult,
  prevSha: string,
  currSha: string
): string | null {
  const danglers: string[] = [];
  if (!result.prevShaReachable) danglers.push(prevSha.slice(0, 8));
  if (!result.currShaReachable) danglers.push(currSha.slice(0, 8));
  if (danglers.length === 0) return null;
  const label = danglers.length === 1 ? "commit" : "commits";
  const who = danglers.join(" and ");
  const n = result.degradedFileCount;
  const fileLabel = n === 1 ? "file" : "files";
  return `Baseline ${label} ${who} no longer in git history — ${n} ${fileLabel} reconstructed without baseline; results are best-effort.`;
}
