import Link from "next/link";
import { execFileSync } from "child_process";
import {
  getRun,
  getRunDeltaCounts,
  getRunDeltaTable,
  getRunPatch,
} from "@/lib/db";
import {
  computeCrossShaDiff,
  filterPatchText,
  formatCrossShaBanner,
  resolveRepoRoot,
  isShaReachable,
} from "@/lib/diff";
import DiffViewer from "@/components/DiffViewer";
import CompareTable from "@/components/CompareTable";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ a: string; b: string }>;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="rounded p-4 flex flex-col gap-1 min-w-28"
      style={{
        border: "1px solid var(--border-color)",
        backgroundColor: "var(--sidebar-bg)",
      }}
    >
      <span className="text-xs uppercase tracking-wider opacity-50">
        {label}
      </span>
      <span
        className="text-xl font-bold font-mono"
        style={{ color: color ?? "var(--sidebar-active)" }}
      >
        {value}
      </span>
    </div>
  );
}

interface GitLogResult {
  commits: string[];
  prevReachable: boolean;
  currReachable: boolean;
  error: string | null;
}

function getGitLog(
  shaA: string,
  shaB: string,
  repoRoot: string | null
): GitLogResult {
  if (!repoRoot) {
    return {
      commits: [],
      prevReachable: false,
      currReachable: false,
      error: "Could not locate git repo root.",
    };
  }
  const prevReachable = isShaReachable(shaA, repoRoot);
  const currReachable = isShaReachable(shaB, repoRoot);
  if (!prevReachable || !currReachable) {
    return {
      commits: [],
      prevReachable,
      currReachable,
      error: null,
    };
  }
  try {
    const out = execFileSync(
      "git",
      ["log", `${shaA}..${shaB}`, "--oneline"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    return {
      commits: out.trim().split("\n").filter(Boolean),
      prevReachable: true,
      currReachable: true,
      error: null,
    };
  } catch {
    return {
      commits: [],
      prevReachable: true,
      currReachable: true,
      error: "git log failed",
    };
  }
}

const CODE_HIGHLIGHT_PATTERNS = [
  "assets/",
  "skills/",
  "Base_classes/",
  "check_testcases.py",
];

export default async function ComparePage({ params }: PageProps) {
  const { a, b } = await params;

  const runA = getRun(a);
  const runB = getRun(b);

  if (!runA || !runB) {
    return (
      <div>
        <Link
          href="/runs"
          className="text-xs opacity-50 hover:opacity-100 mb-4 inline-block"
          style={{ color: "var(--sidebar-active)" }}
        >
          &larr; Back to Runs
        </Link>
        <div
          className="rounded p-6 text-sm opacity-60 mt-4"
          style={{ border: "1px solid var(--border-color)" }}
        >
          Run not found: {!runA ? <code className="font-mono">{a}</code> : null}
          {!runA && !runB ? " and " : null}
          {!runB ? <code className="font-mono">{b}</code> : null}
        </div>
      </div>
    );
  }

  const deltaCounts = getRunDeltaCounts(b, a);
  const deltaRows = getRunDeltaTable(a, b);
  // Old blobs can contain dashboard/scratch noise; filter at display time so
  // the raw per-run collapsibles and single-sided fallbacks only show
  // simulator-relevant changes. computeCrossShaDiff also filters internally,
  // so pre-filtering here doesn't double-count.
  const rawPatchA = runA.dirty === 1 ? getRunPatch(a) : null;
  const rawPatchB = runB.dirty === 1 ? getRunPatch(b) : null;
  const filteredA = rawPatchA ? filterPatchText(rawPatchA) : null;
  const filteredB = rawPatchB ? filterPatchText(rawPatchB) : null;
  const patchA = filteredA && filteredA.length > 0 ? filteredA : null;
  const patchB = filteredB && filteredB.length > 0 ? filteredB : null;

  const shaA = runA.git_sha;
  const shaB = runB.git_sha;
  const repoRoot = resolveRepoRoot();
  const gitLog =
    shaA && shaB && shaA !== shaB
      ? getGitLog(shaA, shaB, repoRoot)
      : { commits: [], prevReachable: true, currReachable: true, error: null };

  const deltaError =
    runA.overall_avg_error_pct != null && runB.overall_avg_error_pct != null
      ? runB.overall_avg_error_pct - runA.overall_avg_error_pct
      : null;

  const deltaErrorColor =
    deltaError == null
      ? "var(--sidebar-active)"
      : deltaError < 0
      ? "#a6e3a1"
      : deltaError > 0
      ? "#f38ba8"
      : "var(--sidebar-active)";

  const diffLabel = "Code Changes (Run A \u2192 Run B)";
  let reconciledPatch: string | null = null;
  let diffWarning: string | null = null;

  if (patchA && patchB && runA.dirty === 1 && runB.dirty === 1) {
    const result = computeCrossShaDiff(
      patchA,
      shaA ?? "",
      patchB,
      shaB ?? "",
      repoRoot
    );
    reconciledPatch = result.patch;
    diffWarning = formatCrossShaBanner(result, shaA ?? "", shaB ?? "");
  }

  return (
    <div>
      <Link
        href="/runs"
        className="text-xs opacity-50 hover:opacity-100 mb-4 inline-block"
        style={{ color: "var(--sidebar-active)" }}
      >
        &larr; Back to Runs
      </Link>

      <h2
        className="text-lg font-bold mb-1"
        style={{ color: "var(--sidebar-active)" }}
      >
        Compare Runs
      </h2>

      <div className="flex flex-wrap gap-6 mb-6 text-xs font-mono opacity-60">
        <div>
          <span className="opacity-70 mr-1">A (baseline):</span>
          <Link
            href={`/runs/${a}`}
            style={{ color: "var(--sidebar-active)" }}
            className="hover:opacity-80"
          >
            {a.slice(0, 12)}
          </Link>
          <span className="ml-2 opacity-50">
            {shaA?.slice(0, 8) ?? "—"} &middot; {formatDate(runA.started_at)}
          </span>
        </div>
        <div>
          <span className="opacity-70 mr-1">B (current):</span>
          <Link
            href={`/runs/${b}`}
            style={{ color: "var(--sidebar-active)" }}
            className="hover:opacity-80"
          >
            {b.slice(0, 12)}
          </Link>
          <span className="ml-2 opacity-50">
            {shaB?.slice(0, 8) ?? "—"} &middot; {formatDate(runB.started_at)}
          </span>
        </div>
      </div>

      {/* Section 1: Headline strip */}
      <div className="flex flex-wrap gap-4 mb-10">
        <StatCard
          label="Avg Error A"
          value={
            runA.overall_avg_error_pct != null
              ? `${runA.overall_avg_error_pct.toFixed(2)}%`
              : "—"
          }
        />
        <StatCard
          label="Avg Error B"
          value={
            runB.overall_avg_error_pct != null
              ? `${runB.overall_avg_error_pct.toFixed(2)}%`
              : "—"
          }
        />
        <StatCard
          label="\u0394 Avg Error"
          value={
            deltaError != null
              ? `${deltaError > 0 ? "+" : ""}${deltaError.toFixed(2)}%`
              : "—"
          }
          color={deltaErrorColor}
        />
        <StatCard
          label="Improved"
          value={String(deltaCounts.improved)}
          color="#a6e3a1"
        />
        <StatCard
          label="Regressed"
          value={String(deltaCounts.regressed)}
          color="#f38ba8"
        />
        <StatCard
          label="Added"
          value={String(deltaCounts.added)}
          color="#89dceb"
        />
        <StatCard
          label="Retired"
          value={String(deltaCounts.retired)}
          color="#6c7086"
        />
        {deltaCounts.skipped > 0 && (
          <StatCard
            label="Skipped"
            value={String(deltaCounts.skipped)}
            color="#f9e2af"
          />
        )}
      </div>

      {/* Section 2: Testcase delta table */}
      <div className="mb-10">
        <h3
          className="font-bold mb-4 text-sm"
          style={{ color: "var(--sidebar-active)" }}
        >
          Testcase Delta
        </h3>
        <CompareTable rows={deltaRows} />
      </div>

      {/* Section 3: Code/config changes */}
      <div className="mb-8">
        <h3
          className="font-bold mb-4 text-sm"
          style={{ color: "var(--sidebar-active)" }}
        >
          Code / Config Changes
        </h3>

        {/* Git log */}
        {shaA && shaB && shaA !== shaB && (
          <div
            className="rounded p-4 mb-6"
            style={{
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--sidebar-bg)",
            }}
          >
            <h4 className="text-xs uppercase tracking-wider opacity-50 mb-3">
              Git Commits ({shaA.slice(0, 8)} &rarr; {shaB.slice(0, 8)})
            </h4>
            {!gitLog.prevReachable || !gitLog.currReachable ? (
              <p className="text-xs" style={{ color: "#f9e2af" }}>
                Baseline unreachable:
                {!gitLog.prevReachable ? ` ${shaA.slice(0, 8)} (Run A)` : ""}
                {!gitLog.prevReachable && !gitLog.currReachable ? " and" : ""}
                {!gitLog.currReachable ? ` ${shaB.slice(0, 8)} (Run B)` : ""}{" "}
                no longer in git history (rebased/amended away).
              </p>
            ) : gitLog.commits.length === 0 ? (
              <p className="text-xs opacity-50">
                No commits between these SHAs.
              </p>
            ) : (
              <div className="font-mono text-xs space-y-1">
                {gitLog.commits.map((line, i) => {
                  const highlight = CODE_HIGHLIGHT_PATTERNS.some((p) =>
                    line.includes(p)
                  );
                  return (
                    <div
                      key={i}
                      style={{ color: highlight ? "#f9e2af" : "inherit" }}
                    >
                      {line}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Reconciled cross-SHA diff (primary content) */}
        {reconciledPatch !== null && (
          <div
            className="rounded p-4 mb-6 overflow-x-auto"
            style={{
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--sidebar-bg)",
            }}
          >
            <h4 className="text-xs uppercase tracking-wider opacity-50 mb-3">
              {diffLabel}
            </h4>
            {diffWarning && (
              <div
                className="rounded px-3 py-2 mb-3 text-xs"
                style={{
                  backgroundColor: "#3d3000",
                  border: "1px solid #7a6000",
                  color: "#ffd966",
                }}
              >
                {diffWarning}
              </div>
            )}
            {reconciledPatch ? (
              <DiffViewer patch={reconciledPatch} />
            ) : (
              <p className="text-xs opacity-60">
                No code changes between Run A and Run B.
              </p>
            )}
            {(patchA || patchB) && (
              <details className="mt-4">
                <summary
                  className="text-xs uppercase tracking-wider opacity-60 cursor-pointer"
                  style={{ color: "var(--sidebar-active)" }}
                >
                  Show raw per-run patches
                </summary>
                <div className="mt-3 space-y-4">
                  {patchA && (
                    <div>
                      <h5 className="text-xs uppercase tracking-wider opacity-50 mb-2">
                        Run A dirty state patch
                      </h5>
                      <DiffViewer patch={patchA} />
                    </div>
                  )}
                  {patchB && (
                    <div>
                      <h5 className="text-xs uppercase tracking-wider opacity-50 mb-2">
                        Run B dirty state patch
                      </h5>
                      <DiffViewer patch={patchB} />
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Single-sided dirty patches (one run dirty, the other clean) */}
        {reconciledPatch === null && patchA && (
          <div
            className="rounded p-4 mb-6 overflow-x-auto"
            style={{
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--sidebar-bg)",
            }}
          >
            <h4 className="text-xs uppercase tracking-wider opacity-50 mb-3">
              Run A dirty state patch
            </h4>
            <DiffViewer patch={patchA} />
          </div>
        )}
        {reconciledPatch === null && patchB && (
          <div
            className="rounded p-4 mb-6 overflow-x-auto"
            style={{
              border: "1px solid var(--border-color)",
              backgroundColor: "var(--sidebar-bg)",
            }}
          >
            <h4 className="text-xs uppercase tracking-wider opacity-50 mb-3">
              Run B dirty state patch
            </h4>
            <DiffViewer patch={patchB} />
          </div>
        )}

        {!patchA &&
          !patchB &&
          gitLog.commits.length === 0 &&
          (gitLog.prevReachable && gitLog.currReachable) && (
            <p className="text-xs opacity-50">
              No code changes to display between these runs.
            </p>
          )}
      </div>
    </div>
  );
}
