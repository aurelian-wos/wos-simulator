import type { TroopCategory } from "@/lib/heroes-catalogue";
import type {
  OptimizeRatioResult,
  OptimizeSearchMode,
  OptimizeSide,
} from "@/lib/optimize-ratio";

export type { OptimizeRatioResult } from "@/lib/optimize-ratio";

export interface SimulateHeroPayload {
  name: string | null;
  skills: [number, number, number, number];
}

export interface SimulateJoinerPayload {
  name: string;
  skill_1: number;
}

export interface SimulateSidePayload {
  troops: Record<TroopCategory, number>;
  troop_types: Record<TroopCategory, string>;
  heroes: Record<TroopCategory, SimulateHeroPayload>;
  joiners: SimulateJoinerPayload[];
  stats: {
    inf: [number, number, number, number];
    lanc: [number, number, number, number];
    mark: [number, number, number, number];
  };
}

export interface SimulateRequestPayload {
  attacker: SimulateSidePayload;
  defender: SimulateSidePayload;
  replicates: number;
  rally_mode: boolean;
}

export interface SimulateSkillSummary {
  name: string;
  avg_activations: number;
  avg_kills: number;
}

export interface SimulateApiResult {
  replicates: number;
  summary: {
    mean: number;
    std: number;
    best: { value: number; winner: "attacker" | "defender" | "draw" };
    worst: { value: number; winner: "attacker" | "defender" | "draw" };
    attacker_win_rate: number;
    avg_skill_activations: number;
    avg_skill_kills: number;
    avg_attacker_activations: number;
    avg_defender_activations: number;
    avg_attacker_kills: number;
    avg_defender_kills: number;
  };
  outcomes: number[];
  per_side_skills: {
    attacker: SimulateSkillSummary[];
    defender: SimulateSkillSummary[];
  };
}

export interface OptimizeRatioRequestPayload extends SimulateRequestPayload {
  grid_step: number;
  search_replicates: number;
  infantry_min_pct: number;
  infantry_max_pct: number;
  top_n: number;
  search_mode?: OptimizeSearchMode;
  optimize_side?: OptimizeSide;
}

export type SavedSimulationKind = "simulate" | "optimize_ratio";

export interface SimulationSaveMeta {
  saved_run_id: string;
  saved_at: string;
  saved_kind: SavedSimulationKind;
  share_url: string;
}

export type SimulateApiResponse = SimulateApiResult & SimulationSaveMeta;
export type OptimizeRatioApiResponse = OptimizeRatioResult & SimulationSaveMeta;

export type SavedSimulationRequest =
  | SimulateRequestPayload
  | OptimizeRatioRequestPayload;

export type SavedSimulationResult = SimulateApiResult | OptimizeRatioResult;

export interface SavedSimulationRunDocument {
  version: 1;
  id: string;
  kind: SavedSimulationKind;
  created_at: string;
  request: SavedSimulationRequest;
  result: SavedSimulationResult;
}

export interface SavedSimulationRunResponse extends SavedSimulationRunDocument {
  share_url: string;
}

export function buildSimulationShareUrl(id: string): string {
  return `/simulate?run=${encodeURIComponent(id)}`;
}
