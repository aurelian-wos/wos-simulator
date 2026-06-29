"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  defaultSide,
  loadLocalStatPresets,
  newStatPresetId,
  saveLocalStatPresets,
  sideFromPayload,
  sideWithPresetStats,
  heroAdjustedStats,
  mergeSideFromOcr,
  SidePanel,
  ProgressBar,
  RecentRunsModal,
  toApiPayload,
  type SideState,
  type Side,
} from "@/app/simulate/SimulateClient";
import { TROOP_TIERS, type TroopCategory } from "@/lib/heroes-catalogue";
import { runWorkerProgressiveSurfaceSweep } from "@/lib/simulator/worker-client";
import {
  estimateProgressiveSurfaceBattles,
  latticePoints,
  progressiveSurfaceStages,
  type SurfaceSweepPayload,
  type SurfacePoint,
  type SurfaceSweepResult,
} from "@/lib/simulator/surface";
import {
  buildSimulationRunTitle,
  type SavedSimulationRunListItem,
  type SavedSimulationRunResponse,
  type SimulationSaveMeta,
} from "@/lib/simulate-run";
import {
  cleanStatPresetName,
  MAX_STAT_PRESETS,
  normalizePlayerStatPreset,
  normalizeStatPresetStats,
  sortPlayerStatPresets,
  type PlayerStatPreset,
} from "@/lib/stat-presets";
import TernaryPanel, { WinrateLegend } from "@/components/TernaryPanel";
import UploadReportModal, {
  type UploadActiveModifiers,
  type UploadReportSubmission,
} from "@/components/UploadReportModal";

const STAT_PRESETS_KEY = "wos-simulator.player-stat-presets.v1";
const RECENT_RUNS_PAGE_SIZE = 20;
const DEFAULT_N = 11;
const DEFAULT_REPLICATES = 5;
const DEFAULT_TOTAL = 100_000;
const DEFAULT_TIER = "t11_fc10";

type PresetStatus = { kind: "ok" | "error"; message: string } | null;
type ProgressState = { done: number; total: number } | null;
type SavedRunMeta = {
  id: string;
  createdAt: string;
  shareUrl: string;
  title: string;
};
type SaveMetaPayload = Partial<SimulationSaveMeta> & { error?: string };

function skill4LevelsFromSide(side: SideState): Record<TroopCategory, number> {
  return {
    infantry: side.heroes.infantry.skills[3],
    lancer: side.heroes.lancer.skills[3],
    marksman: side.heroes.marksman.skills[3],
  };
}

function activeModifiersFromSide(side: SideState): UploadActiveModifiers {
  return {
    statModifiers: { ...side.statModifiers },
    petModifiers: { ...side.petModifiers },
  };
}

function surfaceOcrSideWithoutTroops(side: UploadReportSubmission["ocr"]["attacker"]) {
  return {
    ...side,
    troops: { infantry: null, lancer: null, marksman: null },
    troop_types: { infantry: null, lancer: null, marksman: null },
  };
}

interface SurfaceClientProps {
  initialRunId?: string | null;
  initialSavedRun?: SavedSimulationRunResponse | null;
  initialSavedRunError?: string | null;
}

interface InitialSurfaceState {
  attacker: SideState;
  defender: SideState;
  loadedPresetNames: Record<Side, string | null>;
  pointsPerEdge: number;
  replicates: number;
  total: number;
  tier: string;
  rallyMode: boolean;
  jobs: number;
  result: SurfaceSweepResult | null;
  shownPointsPerEdge: number | null;
  savedRunMeta: SavedRunMeta | null;
  savedRunError: string | null;
}

function meanRow(matrix: number[], rowIdx: number, T: number): number {
  let sum = 0;
  for (let j = 0; j < T; j++) sum += matrix[rowIdx * T + j];
  return sum / T;
}

function meanCol(matrix: number[], colIdx: number, T: number): number {
  let sum = 0;
  for (let i = 0; i < T; i++) sum += matrix[i * T + colIdx];
  return sum / T;
}

function surfacePointLabel(point: SurfacePoint | undefined, total: number): string {
  if (!point) return "selected composition";
  const inf = Math.round((point.inf / total) * 100);
  const lanc = Math.round((point.lanc / total) * 100);
  const mark = Math.round((point.mark / total) * 100);
  return `${inf}i / ${lanc}l / ${mark}m`;
}

export function attackerSurfaceValues(
  matrix: number[],
  T: number,
  activeDefIdx: number | null,
): number[] {
  if (activeDefIdx !== null) {
    return Array.from({ length: T }, (_, i) => matrix[i * T + activeDefIdx]);
  }
  return Array.from({ length: T }, (_, i) => meanRow(matrix, i, T));
}

export function defenderSurfaceValues(
  matrix: number[],
  T: number,
  activeAttIdx: number | null,
): number[] {
  if (activeAttIdx !== null) {
    return Array.from({ length: T }, (_, j) => matrix[activeAttIdx * T + j]);
  }
  return Array.from({ length: T }, (_, j) => meanCol(matrix, j, T));
}

export function nextProgressState(
  prev: ProgressState,
  done: number,
  total: number,
): ProgressState {
  if (!prev) return { done, total };
  if (prev.done === done && prev.total === total) return prev;
  if (prev.total !== total || done <= 0 || done >= total) return { done, total };
  const prevPct = Math.floor((prev.done / Math.max(1, prev.total)) * 100);
  const nextPct = Math.floor((done / Math.max(1, total)) * 100);
  return prevPct === nextPct ? prev : { done, total };
}

export function nextNullableNumberState(
  prev: number | null,
  next: number | null,
): number | null {
  return prev === next ? prev : next;
}

export function buildInitialSurfaceState(
  saved: SavedSimulationRunResponse | null | undefined,
  error: string | null | undefined,
): InitialSurfaceState {
  if (!saved || saved.kind !== "surface_sweep") {
    return {
      attacker: defaultSide(),
      defender: defaultSide(),
      loadedPresetNames: { attacker: null, defender: null },
      pointsPerEdge: DEFAULT_N,
      replicates: DEFAULT_REPLICATES,
      total: DEFAULT_TOTAL,
      tier: DEFAULT_TIER,
      rallyMode: false,
      jobs: 4,
      result: null,
      shownPointsPerEdge: null,
      savedRunMeta: null,
      savedRunError: error ?? null,
    };
  }

  const request = saved.request as SurfaceSweepPayload;
  const result = saved.result as SurfaceSweepResult;
  return {
    attacker: sideFromPayload(request.attacker),
    defender: sideFromPayload(request.defender),
    loadedPresetNames: {
      attacker:
        typeof request.attacker?.stat_profile_name === "string"
          ? request.attacker.stat_profile_name
          : null,
      defender:
        typeof request.defender?.stat_profile_name === "string"
          ? request.defender.stat_profile_name
          : null,
    },
    pointsPerEdge: Math.max(1, Math.min(21, Math.floor(request.pointsPerEdge || DEFAULT_N))),
    replicates: Math.max(1, Math.min(50, Math.floor(request.replicates || DEFAULT_REPLICATES))),
    total: Math.max(1, Math.floor(request.total || DEFAULT_TOTAL)),
    tier: typeof request.tier === "string" ? request.tier : DEFAULT_TIER,
    rallyMode: Boolean(request.rallyMode),
    jobs: Math.max(1, Math.min(16, Math.floor(request.jobs || 4))),
    result,
    shownPointsPerEdge: Math.max(1, Math.min(21, Math.floor(request.pointsPerEdge || DEFAULT_N))),
    savedRunMeta: {
      id: saved.id,
      createdAt: saved.created_at,
      shareUrl: saved.share_url,
      title: buildSimulationRunTitle(saved.request, saved.kind),
    },
    savedRunError: null,
  };
}

export default function SurfaceClient({
  initialRunId = null,
  initialSavedRun = null,
  initialSavedRunError = null,
}: SurfaceClientProps) {
  const router = useRouter();
  const initialState = useMemo(
    () => buildInitialSurfaceState(initialSavedRun, initialSavedRunError),
    [initialSavedRun, initialSavedRunError],
  );
  const [attacker, setAttacker] = useState<SideState>(() => initialState.attacker);
  const [defender, setDefender] = useState<SideState>(() => initialState.defender);
  const [pointsPerEdge, setPointsPerEdge] = useState(initialState.pointsPerEdge);
  const [replicates, setReplicates] = useState(initialState.replicates);
  const [total, setTotal] = useState(initialState.total);
  const [tier, setTier] = useState(initialState.tier);
  const [rallyMode, setRallyMode] = useState(initialState.rallyMode);
  const [syncStatsOnHeroChange, setSyncStatsOnHeroChange] = useState(true);
  const [jobs, setJobs] = useState(initialState.jobs);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SurfaceSweepResult | null>(() => initialState.result);
  const [shownPointsPerEdge, setShownPointsPerEdge] = useState<number | null>(() => initialState.shownPointsPerEdge);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  // Hover / pin state
  const [hoveredAttIdx, setHoveredAttIdx] = useState<number | null>(null);
  const [hoveredDefIdx, setHoveredDefIdx] = useState<number | null>(null);
  const [pinnedAttIdx, setPinnedAttIdx] = useState<number | null>(null);
  const [pinnedDefIdx, setPinnedDefIdx] = useState<number | null>(null);

  // Stat presets
  const [statPresets, setStatPresets] = useState<PlayerStatPreset[]>([]);
  const [presetModalSide, setPresetModalSide] = useState<Side | null>(null);
  const [presetDraftName, setPresetDraftName] = useState("");
  const [presetStatus, setPresetStatus] = useState<PresetStatus>(null);
  const [loadedPresetIds, setLoadedPresetIds] = useState<Record<Side, string | null>>({ attacker: null, defender: null });
  const [loadedPresetNames, setLoadedPresetNames] = useState<Record<Side, string | null>>(() => initialState.loadedPresetNames);
  const [savedRunMeta, setSavedRunMeta] = useState<SavedRunMeta | null>(() => initialState.savedRunMeta);
  const [savedRunError, setSavedRunError] = useState<string | null>(() => initialState.savedRunError);
  const [recentRunsOpen, setRecentRunsOpen] = useState(false);
  const [recentRuns, setRecentRuns] = useState<SavedSimulationRunListItem[]>([]);
  const [recentRunsLoading, setRecentRunsLoading] = useState(false);
  const [recentRunsLoadingMore, setRecentRunsLoadingMore] = useState(false);
  const [recentRunsHasMore, setRecentRunsHasMore] = useState(false);
  const [recentRunsError, setRecentRunsError] = useState<string | null>(null);
  const activePresetId = presetModalSide ? (loadedPresetIds[presetModalSide] ?? "") : "";

  const cancelRef = useRef<(() => void) | null>(null);
  const loadedRunIdRef = useRef<string | null>(initialSavedRun?.id ?? null);
  const previousInitialRunIdRef = useRef<string | null>(initialRunId);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STAT_PRESETS_KEY);
      if (raw) setStatPresets(sortPlayerStatPresets((JSON.parse(raw) as unknown[]).map(normalizePlayerStatPreset)));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!presetModalSide) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPresetModalSide(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presetModalSide]);

  const fetchRecentRuns = useCallback(async (offset: number) => {
    if (offset === 0) setRecentRunsLoading(true);
    else setRecentRunsLoadingMore(true);
    setRecentRunsError(null);
    try {
      const params = new URLSearchParams({
        limit: String(RECENT_RUNS_PAGE_SIZE),
        offset: String(offset),
        kinds: "surface_sweep",
      });
      const res = await fetch(`/api/simulate/runs?${params}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        runs?: SavedSimulationRunListItem[];
        has_more?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Recent runs request failed with ${res.status}`);
      }
      setRecentRuns((prev) =>
        offset === 0 ? data.runs ?? [] : [...prev, ...(data.runs ?? [])],
      );
      setRecentRunsHasMore(Boolean(data.has_more));
    } catch (err) {
      setRecentRunsError(err instanceof Error ? err.message : "Failed to load recent surfaces");
    } finally {
      if (offset === 0) setRecentRunsLoading(false);
      else setRecentRunsLoadingMore(false);
    }
  }, []);

  const refreshRecentRuns = useCallback(async () => {
    await fetchRecentRuns(0);
  }, [fetchRecentRuns]);

  const loadMoreRecentRuns = useCallback(async () => {
    await fetchRecentRuns(recentRuns.length);
  }, [fetchRecentRuns, recentRuns.length]);

  useEffect(() => {
    if (recentRunsOpen) void refreshRecentRuns();
  }, [recentRunsOpen, refreshRecentRuns]);

  useEffect(() => {
    document.title = savedRunMeta
      ? `${savedRunMeta.title} - WOS Simulator`
      : "Ratio Explorer - WOS Simulator";
    return () => {
      document.title = "WOS Simulator Dashboard";
    };
  }, [savedRunMeta]);

  const storeSavedRunMeta = useCallback((meta: SavedRunMeta) => {
    loadedRunIdRef.current = meta.id;
    setSavedRunMeta(meta);
    setSavedRunError(null);
  }, []);

  const applySavedRun = useCallback((saved: SavedSimulationRunResponse) => {
    const next = buildInitialSurfaceState(saved, null);
    setAttacker(next.attacker);
    setDefender(next.defender);
    setLoadedPresetIds({ attacker: null, defender: null });
    setLoadedPresetNames(next.loadedPresetNames);
    setPointsPerEdge(next.pointsPerEdge);
    setReplicates(next.replicates);
    setTotal(next.total);
    setTier(next.tier);
    setRallyMode(next.rallyMode);
    setJobs(next.jobs);
    setResult(next.result);
    setShownPointsPerEdge(next.shownPointsPerEdge);
    setProgress(null);
    setError(null);
    setPinnedAttIdx(null);
    setPinnedDefIdx(null);
    setHoveredAttIdx(null);
    setHoveredDefIdx(null);
    if (next.savedRunMeta) storeSavedRunMeta(next.savedRunMeta);
  }, [storeSavedRunMeta]);

  useEffect(() => {
    const previousInitialRunId = previousInitialRunIdRef.current;
    previousInitialRunIdRef.current = initialRunId;
    if (!initialRunId) {
      if (!previousInitialRunId) return;
      const next = buildInitialSurfaceState(null, null);
      setAttacker(next.attacker);
      setDefender(next.defender);
      setLoadedPresetIds({ attacker: null, defender: null });
      setLoadedPresetNames(next.loadedPresetNames);
      setPointsPerEdge(next.pointsPerEdge);
      setReplicates(next.replicates);
      setTotal(next.total);
      setTier(next.tier);
      setRallyMode(next.rallyMode);
      setJobs(next.jobs);
      setResult(null);
      setShownPointsPerEdge(null);
      setProgress(null);
      setError(null);
      setSavedRunMeta(null);
      setSavedRunError(null);
      loadedRunIdRef.current = null;
      return;
    }
    if (loadedRunIdRef.current === initialRunId) return;

    let cancelled = false;
    setSavedRunError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/simulate/runs/${encodeURIComponent(initialRunId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as SavedSimulationRunResponse | { error?: string };
        if (!res.ok) {
          throw new Error(
            ("error" in data && data.error) ||
              `Saved surface request failed with ${res.status}`,
          );
        }
        if (cancelled) return;
        const saved = data as SavedSimulationRunResponse;
        if (saved.kind !== "surface_sweep") {
          throw new Error(`Saved run ${initialRunId} does not belong to Ratio Explorer.`);
        }
        applySavedRun(saved);
      } catch (err) {
        if (!cancelled) {
          setSavedRunError(
            err instanceof Error ? err.message : "Failed to load saved surface",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySavedRun, initialRunId]);

  // Derived values from the matrix
  const T = result ? result.points.length : 0;
  const matrix = result?.winrateMatrix ?? [];

  // Attacker panel values: mean WR as attacker vs all defenders (or vs hovered/pinned defender)
  const activeDefIdx = hoveredDefIdx ?? pinnedDefIdx;
  const attValues = useMemo(() => {
    if (!result) return [];
    return attackerSurfaceValues(matrix, T, activeDefIdx);
  }, [result, matrix, T, activeDefIdx]);

  // Defender panel values: mean WR as defender vs all attackers (or vs hovered/pinned attacker)
  const activeAttIdx = hoveredAttIdx ?? pinnedAttIdx;
  const defValues = useMemo(() => {
    if (!result) return [];
    return defenderSurfaceValues(matrix, T, activeAttIdx);
  }, [result, matrix, T, activeAttIdx]);

  const estimatedPairs = useMemo(() => {
    const pts = latticePoints(pointsPerEdge, total);
    const t = pts.length;
    return t * t;
  }, [pointsPerEdge, total]);

  const stagePlan = useMemo(() => progressiveSurfaceStages(pointsPerEdge), [pointsPerEdge]);
  const estimatedBattles = useMemo(
    () => estimateProgressiveSurfaceBattles(pointsPerEdge, total, replicates),
    [pointsPerEdge, total, replicates],
  );
  const stageStatus = loading
    ? shownPointsPerEdge
      ? shownPointsPerEdge >= pointsPerEdge
        ? `Showing final ${shownPointsPerEdge}-point surface`
        : `Showing ${shownPointsPerEdge}-point preview, refining to ${pointsPerEdge}`
      : `Calculating ${stagePlan[0]}-point preview`
    : shownPointsPerEdge
      ? `Showing ${shownPointsPerEdge}-point surface`
      : null;

  function maybeActivateSavedRun(
    meta: SaveMetaPayload,
    request: SurfaceSweepPayload,
  ) {
    if (
      typeof meta.saved_run_id !== "string" ||
      typeof meta.saved_at !== "string" ||
      typeof meta.share_url !== "string" ||
      meta.saved_kind !== "surface_sweep"
    ) {
      return;
    }
    const shareUrl = meta.share_url;
    storeSavedRunMeta({
      id: meta.saved_run_id,
      createdAt: meta.saved_at,
      shareUrl,
      title: buildSimulationRunTitle(request, "surface_sweep"),
    });
    if (
      typeof window !== "undefined" &&
      `${window.location.pathname}${window.location.search}` !== shareUrl
    ) {
      window.history.pushState(null, "", shareUrl);
    }
    router.push(shareUrl, { scroll: false });
  }

  async function saveComputedRun(
    request: SurfaceSweepPayload,
    computedResult: SurfaceSweepResult,
  ): Promise<SaveMetaPayload> {
    const res = await fetch("/api/simulate/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "surface_sweep",
        request,
        result: computedResult,
      }),
    });
    const data = (await res.json()) as SaveMetaPayload;
    if (!res.ok) {
      throw new Error(data.error || `Saved surface request failed with ${res.status}`);
    }
    return data;
  }

  async function generate() {
    if (loading) {
      cancelRef.current?.();
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setShownPointsPerEdge(null);
    setPinnedAttIdx(null);
    setPinnedDefIdx(null);
    setHoveredAttIdx(null);
    setHoveredDefIdx(null);
    setProgress({ done: 0, total: estimatedBattles });
    setSavedRunError(null);

    const payload = toApiPayload(attacker, defender, 1, rallyMode, loadedPresetNames);
    const surfacePayload = {
      attacker: payload.attacker,
      defender: payload.defender,
      pointsPerEdge,
      total,
      tier,
      replicates,
      rallyMode,
      jobs,
    } satisfies SurfaceSweepPayload;
    const job = runWorkerProgressiveSurfaceSweep(
      surfacePayload,
      (done, total) => {
        setProgress((prev) => nextProgressState(prev, done, total));
      },
      (stage) => {
        setResult(stage.result);
        setShownPointsPerEdge((prev) => nextNullableNumberState(prev, stage.pointsPerEdge));
        setPinnedAttIdx((prev) => nextNullableNumberState(prev, null));
        setPinnedDefIdx((prev) => nextNullableNumberState(prev, null));
        setHoveredAttIdx((prev) => nextNullableNumberState(prev, null));
        setHoveredDefIdx((prev) => nextNullableNumberState(prev, null));
      },
    );
    cancelRef.current = job.cancel;
    try {
      const finalResult = await job.promise;
      setResult(finalResult);
      setShownPointsPerEdge((prev) => nextNullableNumberState(prev, pointsPerEdge));
      try {
        const saveMeta = await saveComputedRun(surfacePayload, finalResult);
        maybeActivateSavedRun(saveMeta, surfacePayload);
      } catch (saveErr) {
        setSavedRunError(
          saveErr instanceof Error
            ? saveErr.message
            : "Surface completed but failed to save",
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message !== "cancelled") {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      cancelRef.current = null;
    }
  }

  const openPreset = useCallback((side: Side) => {
    const loaded = statPresets.find((p) => p.id === loadedPresetIds[side]);
    setPresetModalSide(side);
    setPresetDraftName(loaded?.name ?? loadedPresetNames[side] ?? `${side === "attacker" ? "Attacker" : "Defender"} profile`);
    setPresetStatus(null);
  }, [statPresets, loadedPresetIds, loadedPresetNames]);

  function choosePreset(id: string) {
    if (!presetModalSide) return;
    if (!id) {
      setLoadedPresetIds((p) => ({ ...p, [presetModalSide]: null }));
      setLoadedPresetNames((p) => ({ ...p, [presetModalSide]: null }));
      setPresetStatus({ kind: "ok", message: "No profile loaded." });
      return;
    }
    const preset = statPresets.find((p) => p.id === id);
    if (!preset) { setPresetStatus({ kind: "error", message: "Choose a profile." }); return; }
    const setter = presetModalSide === "attacker" ? setAttacker : setDefender;
    setter((prev) => sideWithPresetStats(prev, preset));
    setLoadedPresetIds((p) => ({ ...p, [presetModalSide]: preset.id }));
    setLoadedPresetNames((p) => ({ ...p, [presetModalSide]: preset.name }));
    setPresetDraftName(preset.name);
    setPresetStatus({ kind: "ok", message: `Loaded ${preset.name}.` });
  }

  function createPreset() {
    if (!presetModalSide) return;
    if (statPresets.length >= MAX_STAT_PRESETS) { setPresetStatus({ kind: "error", message: `Preset limit reached (${MAX_STAT_PRESETS})` }); return; }
    const source = presetModalSide === "attacker" ? attacker : defender;
    const timestamp = new Date().toISOString();
    const preset: PlayerStatPreset = {
      id: newStatPresetId(),
      name: cleanStatPresetName(presetDraftName) || `Preset ${statPresets.length + 1}`,
      created_at: timestamp,
      updated_at: timestamp,
      stats: normalizeStatPresetStats(heroAdjustedStats(source, "subtract")),
    };
    const next = sortPlayerStatPresets([preset, ...statPresets.filter((p) => p.id !== preset.id)]);
    saveLocalStatPresets(next);
    setStatPresets(next);
    setLoadedPresetIds((p) => ({ ...p, [presetModalSide]: preset.id }));
    setLoadedPresetNames((p) => ({ ...p, [presetModalSide]: preset.name }));
    setPresetDraftName(preset.name);
    setPresetStatus({ kind: "ok", message: `Created ${preset.name}.` });
  }

  function applyUpload(submission: UploadReportSubmission) {
    const {
      ocr,
      heroes,
      rallyMode: modalRally,
      skill4Levels,
      activeModifiers,
    } = submission;
    if (modalRally !== rallyMode) setRallyMode(modalRally);
    setAttacker((prev) =>
      mergeSideFromOcr(
        prev,
        surfaceOcrSideWithoutTroops(ocr.attacker),
        heroes.attacker,
        modalRally,
        "attacker",
        skill4Levels.attacker ?? skill4LevelsFromSide(prev),
        activeModifiers.attacker ?? activeModifiersFromSide(prev),
        activeModifiers.defender ?? activeModifiersFromSide(defender),
      ),
    );
    setDefender((prev) =>
      mergeSideFromOcr(
        prev,
        surfaceOcrSideWithoutTroops(ocr.defender),
        heroes.defender,
        modalRally,
        "defender",
        skill4Levels.defender ?? skill4LevelsFromSide(prev),
        activeModifiers.defender ?? activeModifiersFromSide(prev),
        activeModifiers.attacker ?? activeModifiersFromSide(attacker),
      ),
    );
    setUploadWarnings(ocr.warnings ?? []);
  }

  return (
    <div className="simulate-workspace">
      {/* Header */}
      <div className="mb-4 space-y-2">
        <h2 className="text-lg font-bold">Ratio Explorer</h2>
        <p className="text-xs opacity-60 max-w-2xl">
          Sweeps the full ternary simplex of troop compositions for both sides and displays winrates as heatmaps.
          Hover a point on one triangle to see how that composition fares against every opponent composition on the other.
        </p>
      </div>

      <section className="sim-start-card surface-start-card mb-4" data-testid="surface-start-card">
        <div className="sim-start-file-actions">
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="sim-upload-primary px-3 py-2"
          >
            <span className="block text-xs font-bold">Upload report</span>
          </button>
          <button
            type="button"
            onClick={() => setRecentRunsOpen(true)}
            className="sim-edit-chip min-h-[32px] px-3 text-xs font-bold"
            data-testid="surface-recent-runs-toggle"
          >
            Recent runs
          </button>
        </div>
        <div className="sim-start-toggles surface-start-toggles">
          <label
            className="sim-toggle grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-2.5 py-1.5 text-xs font-bold"
            data-active={rallyMode}
            title="Rally mode: asymmetric skills active; runs full T² matrix."
          >
            <input
              className="sim-switch-input"
              type="checkbox"
              checked={rallyMode}
              onChange={(e) => setRallyMode(e.target.checked)}
              aria-label="Rally mode"
            />
            <span className="sim-switch" aria-hidden="true" />
            <span>Rally mode</span>
          </label>
          <label
            className="sim-toggle grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-2.5 py-1.5 text-xs font-bold"
            data-active={syncStatsOnHeroChange}
            title="When you change a hero, apply the A/D/L/H difference between the old and new hero to that army's matching troop-type stats."
          >
            <input
              className="sim-switch-input"
              type="checkbox"
              checked={syncStatsOnHeroChange}
              onChange={(e) => setSyncStatsOnHeroChange(e.target.checked)}
              aria-label="Update stats on hero change"
            />
            <span className="sim-switch" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block">Sync hero stats</span>
            </span>
          </label>
        </div>
      </section>

      {uploadWarnings.length > 0 && (
        <div className="sim-tool-panel mb-4 px-3 py-2 text-xs font-mono" style={{ color: "var(--sim-yellow)" }}>
          OCR warnings:
          <ul className="mt-1 list-inside list-disc">
            {uploadWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </div>
      )}

      {/* Config: two side panels */}
      <div className="surface-role-grid sim-role-grid mb-4">
        <div className="sim-role-slot min-w-0">
          <SidePanel
            title="Attacker"
            which="attacker"
            state={attacker}
            opponent={defender}
            setState={setAttacker as (updater: (prev: SideState) => SideState) => void}
            rallyMode={rallyMode}
            syncStatsOnHeroChange={syncStatsOnHeroChange}
            onStatSync={() => undefined}
            loadedPresetName={loadedPresetNames.attacker}
            onOpenPreset={() => openPreset("attacker")}
            hideTroopCount={true}
            fixedTroopTier={tier}
          />
        </div>
        <div className="sim-role-slot min-w-0">
          <SidePanel
            title="Defender"
            which="defender"
            state={defender}
            opponent={attacker}
            setState={setDefender as (updater: (prev: SideState) => SideState) => void}
            rallyMode={rallyMode}
            syncStatsOnHeroChange={syncStatsOnHeroChange}
            onStatSync={() => undefined}
            loadedPresetName={loadedPresetNames.defender}
            onOpenPreset={() => openPreset("defender")}
            hideTroopCount={true}
            fixedTroopTier={tier}
          />
        </div>
      </div>
      {/* Grid settings + run bar */}
      <div className="sim-tool-panel mb-4 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Points / edge (N)</span>
          <select
            value={pointsPerEdge}
            onChange={(e) => setPointsPerEdge(Number(e.target.value))}
            className="sim-input font-mono text-sm"
          >
            {[6, 11, 21].map((n) => (
              <option key={n} value={n}>{n} → {((n * (n + 1)) / 2)} compositions</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Replicates / pair</span>
          <input
            type="number"
            min={1}
            max={50}
            value={replicates}
            onChange={(e) => setReplicates(Math.max(1, Math.min(50, parseInt(e.target.value || "1", 10))))}
            className="sim-input font-mono text-sm tabular-nums"
            style={{ textAlign: "right" }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Tier</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="sim-input font-mono text-sm"
          >
            {TROOP_TIERS.map((t) => (
              <option key={t} value={t}>{t.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Workers</span>
          <input
            type="number"
            min={1}
            max={16}
            value={jobs}
            onChange={(e) => setJobs(Math.max(1, Math.min(16, parseInt(e.target.value || "1", 10))))}
            className="sim-input font-mono text-sm tabular-nums"
            style={{ textAlign: "right" }}
          />
        </label>
      </div>

      <div className="sim-top-actions surface-action-dock" data-testid="surface-action-dock">
        <div className="sim-action-card sim-action-card-run surface-action-card">
          <div className="sim-runbar surface-runbar mb-4" data-testid="surface-runbar">
            <button
              onClick={generate}
              className="sim-run-button px-5 py-2 text-sm font-black"
              style={{ opacity: loading ? 0.75 : 1 }}
            >
              {loading ? "Cancel" : "Generate surface"}
            </button>
            <span className="text-xs font-mono opacity-60">
              {estimatedPairs.toLocaleString()} final pairs · {replicates} reps · {estimatedBattles.toLocaleString()} staged battles
            </span>
            {stageStatus && <span className="text-xs font-mono opacity-60">{stageStatus}</span>}
            {error && <span className="col-span-2 text-xs" style={{ color: "#f38ba8" }}>{error}</span>}
            {savedRunError && <span className="col-span-2 text-xs" style={{ color: "#f38ba8" }}>{savedRunError}</span>}
            {savedRunMeta && !savedRunError && (
              <span className="col-span-2 text-xs font-mono opacity-60">
                Share URL: <a className="underline" href={savedRunMeta.shareUrl}>{savedRunMeta.shareUrl}</a>
              </span>
            )}
            <div className="col-span-2">
              <ProgressBar
                active={loading}
                done={progress?.done ?? 0}
                total={progress?.total ?? estimatedBattles}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results: two ternary panels */}
      {result && (
        <div className="sim-tool-panel p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6 sm:justify-center sm:items-start">
            <TernaryPanel
              points={result.points}
              total={total}
              values={attValues}
              selectedIdx={pinnedAttIdx}
              title={activeDefIdx !== null
                ? "Attackers vs selected defender"
                : "Attackers — mean vs all defenders"}
              subtitle={activeDefIdx !== null
                ? `Each point shows the matchup outcome against defender ${surfacePointLabel(result.points[activeDefIdx], total)}.`
                : "Each point shows the average matchup outcome across all defender compositions."}
              showLegend={false}
              onHover={(i) => {
                setHoveredAttIdx((prev) => nextNullableNumberState(prev, i));
                if (i !== null) setHoveredDefIdx((prev) => nextNullableNumberState(prev, null));
              }}
              onClick={(i) => {
                setPinnedAttIdx((prev) => (prev === i ? null : i));
                setPinnedDefIdx((prev) => nextNullableNumberState(prev, null));
              }}
            />
            <TernaryPanel
              points={result.points}
              total={total}
              values={defValues}
              selectedIdx={pinnedDefIdx}
              title={activeAttIdx !== null
                ? "Defenders vs selected attacker"
                : "Defenders — mean matchup outcome"}
              subtitle={activeAttIdx !== null
                ? `Each point shows the matchup outcome for selected attacker ${surfacePointLabel(result.points[activeAttIdx], total)}.`
                : "Each point shows the average matchup outcome across all attacker compositions."}
              showLegend={false}
              onHover={(j) => {
                setHoveredDefIdx((prev) => nextNullableNumberState(prev, j));
                if (j !== null) setHoveredAttIdx((prev) => nextNullableNumberState(prev, null));
              }}
              onClick={(j) => {
                setPinnedDefIdx((prev) => (prev === j ? null : j));
                setPinnedAttIdx((prev) => nextNullableNumberState(prev, null));
              }}
            />
          </div>
          <div className="mt-3">
            <WinrateLegend />
          </div>
          <p className="mt-3 text-center text-[10px] opacity-50">
            Blue is defender-favored, white is even, and red is attacker-favored. Hover a point to show that composition matchup profile on the other triangle; click to pin.
          </p>
        </div>
      )}

      {/* Stat preset modal */}
      {presetModalSide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
          role="dialog"
          aria-modal="true"
          onClick={() => setPresetModalSide(null)}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); createPreset(); }}
            className="sim-modal w-full max-w-md p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="sim-modal-title">
                {presetModalSide === "attacker" ? "Attacker" : "Defender"} profile
              </h3>
              <button
                type="button"
                onClick={() => setPresetModalSide(null)}
                className="sim-edit-chip min-h-[32px] px-2 py-1 text-sm font-bold"
              >
                ×
              </button>
            </div>
            <label className="mb-3 flex flex-col gap-1">
              <span className="sim-field-label">Loaded profile</span>
              <select
                value={activePresetId}
                onChange={(e) => choosePreset(e.target.value)}
                className="sim-input min-h-[40px] px-2 py-2 font-mono text-xs"
              >
                <option value="">— None —</option>
                {statPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="mb-4 flex flex-col gap-1">
              <span className="sim-field-label">New profile name</span>
              <input
                type="text"
                value={presetDraftName}
                onChange={(e) => setPresetDraftName(e.target.value)}
                className="sim-input min-h-[40px] px-2 py-2 text-sm"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="submit" className="sim-edit-chip min-h-[40px] px-3 py-2 text-xs font-bold" style={{ color: "var(--sim-blue)" }}>
                Create from current stats
              </button>
              <button type="button" onClick={() => setPresetModalSide(null)} className="sim-edit-chip min-h-[40px] px-3 py-2 text-xs font-bold">
                Done
              </button>
            </div>
            {presetStatus && (
              <p className="mt-3 text-xs font-mono" style={{ color: presetStatus.kind === "error" ? "#f38ba8" : "#a6e3a1" }}>
                {presetStatus.message}
              </p>
            )}
          </form>
        </div>
      )}

      <UploadReportModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onApply={applyUpload}
        initialRallyMode={rallyMode}
        initialSidesSwapped={false}
      />

      {recentRunsOpen && (
        <RecentRunsModal
          runs={recentRuns}
          loading={recentRunsLoading}
          loadingMore={recentRunsLoadingMore}
          hasMore={recentRunsHasMore}
          error={recentRunsError}
          onClose={() => setRecentRunsOpen(false)}
          onRefresh={() => void refreshRecentRuns()}
          onLoadMore={() => void loadMoreRecentRuns()}
          onChoose={(run) => {
            setRecentRunsOpen(false);
            router.push(run.share_url, { scroll: false });
          }}
        />
      )}
    </div>
  );
}
