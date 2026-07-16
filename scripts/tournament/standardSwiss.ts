import { runBattleTasks } from "./battleRunner";
import { Pool } from "./pools";
import { seededShuffle } from "./rng";
import type { PlayerStats } from "./playerStats";
import type { BattleSummary, BattleTask, Team, TournamentOptions } from "./types";

export type BattleTaskRunner = (tasks: BattleTask[], jobs: number, onProgress?: (completed: number, total: number) => void, batchSize?: number) => Promise<BattleSummary[]>;
export type TeamPairing = [Team, Team];

export function pairingKey(left: Team, right: Team): string {
  return left.id < right.id ? `${left.id}:${right.id}` : `${right.id}:${left.id}`;
}

export function createStandardSwissPairings(orderedTeams: Team[], previousPairings: ReadonlySet<string> = new Set()): TeamPairing[] {
  const remaining = [...orderedTeams];
  const pairings: TeamPairing[] = [];
  while (remaining.length >= 2) {
    const left = remaining.shift();
    if (!left) break;
    let opponentIndex = remaining.findIndex((candidate) => !previousPairings.has(pairingKey(left, candidate)));
    if (opponentIndex < 0) opponentIndex = 0;
    const [right] = remaining.splice(opponentIndex, 1);
    pairings.push([left, right]);
  }
  return pairings;
}

export function createStandardSwissTasks(
  pairings: TeamPairing[],
  roundNum: number,
  reps: number,
  seed: number,
  playerStats?: PlayerStats
): BattleTask[] {
  return pairings.flatMap(([left, right], index) => {
    const baseSeed = seed + roundNum * 10000 + index * 2000;
    return [
      { attacker: left, defender: right, seed: baseSeed, reps, playerStats },
      { attacker: right, defender: left, seed: baseSeed + 1000, reps, playerStats }
    ];
  });
}

export function aggregateCombinedBattleResults(pool: Pool, results: BattleSummary[]): void {
  for (const result of results) {
    const margin = result.avgAttackerLeft - result.avgDefenderLeft;
    const attackerScore = pool.getScore(result.attackerId);
    const defenderScore = pool.getScore(result.defenderId);
    const attackerWinRate = result.attackerWins / result.games;
    const defenderWinRate = result.defenderWins / result.games;
    attackerScore.matches += 1;
    attackerScore.games += result.games;
    attackerScore.margin += margin;
    attackerScore.winRateSum += attackerWinRate;
    attackerScore.attack.matches += 1;
    attackerScore.attack.margin += margin;
    attackerScore.attack.winRateSum += attackerWinRate;
    defenderScore.matches += 1;
    defenderScore.games += result.games;
    defenderScore.margin += -margin;
    defenderScore.winRateSum += defenderWinRate;
    defenderScore.defense.matches += 1;
    defenderScore.defense.margin += -margin;
    defenderScore.defense.winRateSum += defenderWinRate;
  }
}

export async function runStandardSwissTournament(
  pool: Pool,
  options: TournamentOptions,
  runner: BattleTaskRunner = runBattleTasks,
  onProgress?: (label: string, completed: number, total: number) => void
): Promise<Pool> {
  const startedAt = Date.now();
  const previousPairings = new Set<string>();
  let round = 1;
  const freezeEnabled = options.freezeRate > 0 || options.freezeLossesGte !== undefined;
  while (true) {
    const elapsedMins = (Date.now() - startedAt) / 60000;
    const activeTeams = pool.teamsActiveOrdered;
    if (options.timeLimitMins !== undefined && elapsedMins > options.timeLimitMins) break;
    if (round > options.totalRounds) break;
    if (freezeEnabled && activeTeams.length < options.minPoolSize) break;
    if (activeTeams.length < 2) break;
    const isSeedRound = round <= options.seedRounds;
    const orderedTeams = isSeedRound ? seededShuffle(activeTeams, options.seed + round) : activeTeams;
    const pairings = createStandardSwissPairings(orderedTeams, isSeedRound ? new Set() : previousPairings);
    const tasks = createStandardSwissTasks(pairings, round, options.reps, options.seed, options.playerStats);
    const label = `Round ${round} (${isSeedRound ? "random" : "Swiss"})`;
    const results = await runner(tasks, options.jobs, (completed, total) => onProgress?.(label, completed, total), options.batchSize);
    aggregateCombinedBattleResults(pool, results);
    for (const [left, right] of pairings) previousPairings.add(pairingKey(left, right));
    if (freezeEnabled && round >= options.startFreezeRound) {
      freezePool(pool, options);
    }
    round += 1;
  }
  pool.finalizeRemaining();
  return pool;
}

function freezePool(pool: Pool, options: TournamentOptions): void {
  if (options.freezeLossesGte !== undefined) {
    pool.freezeLossesAtLeast(options.freezeLossesGte, pool.countActiveLossesAtLeast(options.freezeLossesGte));
    return;
  }

  pool.freezeBottomTeams(options.freezeRate);
}

export async function runCombinedFinalsRoundRobin(
  teams: Team[],
  reps: number,
  jobs: number,
  seed: number,
  runner: BattleTaskRunner = runBattleTasks,
  onProgress?: (label: string, completed: number, total: number) => void,
  playerStats?: PlayerStats,
  batchSize = 64
): Promise<Pool> {
  const pool = new Pool(teams);
  const tasks: BattleTask[] = [];
  for (let leftIndex = 0; leftIndex < teams.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < teams.length; rightIndex += 1) {
      const left = teams[leftIndex];
      const right = teams[rightIndex];
      const baseSeed = seed + 999000 + tasks.length * 1000;
      tasks.push({ attacker: left, defender: right, seed: baseSeed, reps, playerStats });
      tasks.push({ attacker: right, defender: left, seed: baseSeed + 1000, reps, playerStats });
    }
  }
  const results = await runner(tasks, jobs, (completed, total) => onProgress?.("Finals round-robin", completed, total), batchSize);
  aggregateCombinedBattleResults(pool, results);
  pool.finalizeRemaining();
  return pool;
}
