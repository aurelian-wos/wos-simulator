import { loadSimulatorConfig } from "@simulator/config";
import { simulateBearBattle } from "@simulator/simulator";
import type { BearBattleResult, FighterInput, PassiveEffects, SimulatorConfig, StatBlock, UnitType } from "@simulator/types";
import type {
  BearSimRequestPayload,
  BearSimResult,
  SimulateSidePayload,
  SimulateSkillSummary,
  SimulateTrace,
} from "@/lib/simulate-run";
import { battleResultToTrace } from "./simulate";

const CATEGORIES = ["infantry", "lancer", "marksman"] as const;

export interface BearSimulationOptions {
  seedBase?: string;
  onProgress?: (done: number, total: number) => void;
  config?: SimulatorConfig;
}

export function toBearBattlePlayerInput(request: BearSimRequestPayload): FighterInput {
  return toFighterInput(request.player);
}

export function runBearSimulation(request: BearSimRequestPayload, options: BearSimulationOptions = {}): BearSimResult {
  const config = options.config ?? loadSimulatorConfig();
  const total = Math.max(1, Math.min(5000, Math.floor(request.replicates || 1)));
  const player = toBearBattlePlayerInput(request);
  const results: BearBattleResult[] = [];
  const seeds: Array<string | number> = [];
  for (let index = 0; index < total; index += 1) {
    const seed = `${options.seedBase ?? "bear"}:${index}`;
    seeds.push(seed);
    results.push(simulateBearBattle(player, config, seed));
    if ((index + 1) % Math.max(1, Math.floor(total / 20)) === 0 || index + 1 === total) {
      options.onProgress?.(index + 1, total);
    }
  }
  return aggregateBearResults(results, seeds);
}

export function runBearSimulationTrace(
  request: BearSimRequestPayload,
  seed: string | number,
  options: BearSimulationOptions = {},
): SimulateTrace {
  const config = options.config ?? loadSimulatorConfig();
  const result = simulateBearBattle(toBearBattlePlayerInput(request), config, seed, { mode: "trace" });
  options.onProgress?.(1, 1);
  const trace = battleResultToTrace(result, seed, { attacker: sideTroopHeroGroupLabels(request.player) });
  return { ...trace, outcome: result.score };
}

export function aggregateBearResults(results: BearBattleResult[], seeds: Array<string | number> = []): BearSimResult {
  const scores = results.map((result) => result.score);
  const replicates = Math.max(1, results.length);
  const mean = scores.reduce((sum, value) => sum + value, 0) / replicates;
  const variance = scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / replicates;
  const skills = aggregateSkills(results);
  return {
    replicates,
    summary: {
      mean,
      std: Math.sqrt(variance),
      best: { value: Math.max(...scores) },
      worst: { value: Math.min(...scores) },
      avg_skill_activations: skills.reduce((sum, row) => sum + row.avg_activations, 0),
      avg_skill_damage: skills.reduce((sum, row) => sum + row.avg_kills, 0),
    },
    scores,
    score_runs: scores.map((score, index) => ({ score, seed: seeds[index] ?? index })),
    skills,
  };
}

function toFighterInput(side: SimulateSidePayload): FighterInput {
  return {
    troops: Object.fromEntries(
      CATEGORIES.map((cat) => [
        side.troop_types[cat],
        Math.max(0, Math.floor(side.troops[cat] ?? 0)),
      ]),
    ),
    stats: toStats(side),
    passive: toPassiveEffects(side),
    heroes: toHeroes(side),
    joiner_heroes: toJoinerHeroes(side),
  };
}

function toHeroes(side: SimulateSidePayload): FighterInput["heroes"] {
  const out: NonNullable<FighterInput["heroes"]> = {};
  for (const cat of CATEGORIES) {
    const slot = side.heroes[cat];
    if (!slot?.name) continue;
    out[slot.name] = skillMap(slot.skills);
  }
  return out;
}

function toJoinerHeroes(side: SimulateSidePayload): FighterInput["joiner_heroes"] {
  const out: NonNullable<FighterInput["joiner_heroes"]> = {};
  for (const joiner of side.joiners ?? []) {
    if (!joiner.name) continue;
    out[joiner.name] = { skill_1: Math.max(0, Math.floor(joiner.skill_1 ?? 0)) };
  }
  return out;
}

function skillMap(skills: readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  skills.forEach((value, index) => {
    const level = Math.max(0, Math.floor(value || 0));
    if (level > 0) out[`skill_${index + 1}`] = level;
  });
  return out;
}

function toStats(side: SimulateSidePayload): Record<UnitType, Partial<StatBlock>> {
  return {
    infantry: tupleToStats(side.stats.inf),
    lancer: tupleToStats(side.stats.lanc),
    marksman: tupleToStats(side.stats.mark),
  };
}

function tupleToStats(tuple: [number, number, number, number]): StatBlock {
  return {
    attack: tuple[0],
    defense: tuple[1],
    lethality: tuple[2],
    health: tuple[3],
  };
}

function toPassiveEffects(side: SimulateSidePayload): PassiveEffects | undefined {
  const own = side.stat_modifiers ?? {
    attack: 0,
    defense: 0,
    lethality: 0,
    health: 0,
    enemy_attack: 0,
    enemy_defense: 0,
  };
  const passive: PassiveEffects = {};

  addPassiveStat(passive, "attack", "up", own.attack);
  addPassiveStat(passive, "defense", "up", own.defense);
  addPassiveStat(passive, "lethality", "up", own.lethality);
  addPassiveStat(passive, "health", "up", own.health);

  return Object.keys(passive).length > 0 ? passive : undefined;
}

function addPassiveStat(passive: PassiveEffects, stat: keyof StatBlock, direction: "up" | "down", rawValue: unknown): void {
  const value = Number(rawValue ?? 0);
  if (!Number.isFinite(value) || value <= 0) return;
  passive[stat] = { ...passive[stat], [direction]: value };
}

function aggregateSkills(results: BearBattleResult[]): SimulateSkillSummary[] {
  const totals = new Map<string, { activations: number; kills: number }>();
  for (const result of results) {
    for (const row of result.skillReport.attacker) {
      const entry = totals.get(row.skillName) ?? { activations: 0, kills: 0 };
      entry.activations += row.skillActivations;
      entry.kills += row.skillKills;
      totals.set(row.skillName, entry);
    }
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({
      name,
      avg_activations: value.activations / Math.max(1, results.length),
      avg_kills: value.kills / Math.max(1, results.length),
    }));
}

function sideTroopHeroGroupLabels(side: SimulateSidePayload): Partial<Record<UnitType, string>> {
  return {
    infantry: normalizedGroupLabel(side.heroes.infantry.name),
    lancer: normalizedGroupLabel(side.heroes.lancer.name),
    marksman: normalizedGroupLabel(side.heroes.marksman.name),
  };
}

function normalizedGroupLabel(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
