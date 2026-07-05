import assert from "node:assert/strict";
import { test } from "node:test";

import { Pool } from "./pools";
import {
  aggregateCombinedBattleResults,
  createStandardSwissPairings,
  createStandardSwissTasks,
  pairingKey,
  runCombinedFinalsRoundRobin,
  runStandardSwissTournament
} from "./standardSwiss";
import type { BattleSummary, BattleTask, Team } from "./types";

function team(id: number): Team {
  return {
    id,
    mains: ["Wu Ming", "Mia", "Bradley"],
    joiners: ["Jessie", "Seo-yoon", "Lumak", "Ling"],
    ratioLabel: "50-20-30",
    troops: { infantry_t10: 50, lancer_t10: 20, marksman_t10: 30 }
  };
}

test("aggregateCombinedBattleResults scores attacker and defender in one standings pool", () => {
  const pool = new Pool([team(1), team(2)]);
  aggregateCombinedBattleResults(pool, [
    { attackerId: 1, defenderId: 2, avgAttackerLeft: 10, avgDefenderLeft: 0 },
    { attackerId: 2, defenderId: 1, avgAttackerLeft: 0, avgDefenderLeft: 8 }
  ]);

  assert.equal(pool.getScore(1).wins, 2);
  assert.equal(pool.getScore(1).matches, 2);
  assert.equal(pool.getScore(1).margin, 18);
  assert.equal(pool.getScore(2).wins, 0);
  assert.equal(pool.getScore(2).matches, 2);
  assert.equal(pool.getScore(2).margin, -18);
});

test("createStandardSwissPairings avoids previous pairings when possible", () => {
  const teams = [team(1), team(2), team(3), team(4)];
  const pairings = createStandardSwissPairings(teams, new Set([pairingKey(teams[0], teams[1])]));

  assert.deepEqual(
    pairings.map(([left, right]) => [left.id, right.id]),
    [
      [1, 3],
      [2, 4]
    ]
  );
});

test("createStandardSwissTasks runs both directions for each pairing", () => {
  const teams = [team(1), team(2)];
  const tasks = createStandardSwissTasks([[teams[0], teams[1]]], 3, 2, 99);

  assert.deepEqual(tasks.map((task) => [task.attacker.id, task.defender.id, task.seed, task.reps]), [
    [1, 2, 30099, 2],
    [2, 1, 31099, 2]
  ]);
});

test("runStandardSwissTournament finalizes a single combined pool", async () => {
  const teams = [team(1), team(2), team(3), team(4)];
  const taskCounts: number[] = [];
  const runner = async (tasks: BattleTask[]): Promise<BattleSummary[]> => {
    taskCounts.push(tasks.length);
    return tasks.map((task) => ({
      attackerId: task.attacker.id,
      defenderId: task.defender.id,
      avgAttackerLeft: task.attacker.id < task.defender.id ? 10 : 0,
      avgDefenderLeft: task.attacker.id < task.defender.id ? 0 : 10
    }));
  };

  const pool = await runStandardSwissTournament(
    new Pool(teams),
    {
      totalRounds: 2,
      seedRounds: 0,
      reps: 1,
      jobs: 1,
      batchSize: 64,
      seed: 10,
      freezeRate: 0,
      startFreezeRound: 8,
      minPoolSize: 1
    },
    runner
  );

  assert.deepEqual(taskCounts, [4, 4]);
  assert.equal(pool.scoresActive.length, 0);
  assert.deepEqual(pool.finalScoresOrdered.map((score) => score.team.id), [1, 3, 2, 4]);
});

test("runCombinedFinalsRoundRobin evaluates every matchup in both directions", async () => {
  const teams = [team(1), team(2), team(3)];
  let taskCount = 0;
  const runner = async (tasks: BattleTask[]): Promise<BattleSummary[]> => {
    taskCount = tasks.length;
    return tasks.map((task) => ({
      attackerId: task.attacker.id,
      defenderId: task.defender.id,
      avgAttackerLeft: task.attacker.id === 1 ? 10 : 0,
      avgDefenderLeft: task.attacker.id === 1 ? 0 : 5
    }));
  };

  const pool = await runCombinedFinalsRoundRobin(teams, 1, 1, 10, runner);

  assert.equal(taskCount, 6);
  assert.equal(pool.getScore(1).matches, 4);
  assert.deepEqual(pool.finalScoresOrdered.map((score) => score.team.id), [1, 3, 2]);
});
