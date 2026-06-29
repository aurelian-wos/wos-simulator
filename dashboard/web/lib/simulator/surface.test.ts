import assert from "node:assert/strict";
import { test } from "node:test";

import {
  progressiveSurfaceStages,
  runProgressiveSurfaceSweep,
  runSurfaceSweep,
  type SurfaceBatchResult,
  type SurfaceSweepPayload,
} from "./surface";

test("runSurfaceSweep lets batch runners report live progress without replaying from zero", async () => {
  const progress: Array<[number, number]> = [];

  const result = await runSurfaceSweep(samplePayload(), {
    onProgress: (done, total) => progress.push([done, total]),
    runBatches: async (tasks, onProgress) => {
      onProgress?.(1, 9);
      onProgress?.(3, 9);
      return tasks.map<SurfaceBatchResult>((task) => ({
        attIdx: task.attIdx,
        defIdx: task.defIdx,
        winrate: task.attIdx === task.defIdx ? 0.5 : 0.75,
      }));
    },
  });

  assert.deepEqual(progress, [
    [1, 9],
    [3, 9],
  ]);
  assert.equal(result.points.length, 3);
  assert.equal(result.winrateMatrix.length, 9);
});

test("progressiveSurfaceStages ramps through previews up to the requested final density", () => {
  assert.deepEqual(progressiveSurfaceStages(11), [6, 11]);
  assert.deepEqual(progressiveSurfaceStages(21), [6, 11, 21]);
  assert.deepEqual(progressiveSurfaceStages(31), [6, 11, 21, 31]);
  assert.deepEqual(progressiveSurfaceStages(41), [6, 11, 21, 41]);
});

test("runProgressiveSurfaceSweep emits previews and reuses completed pair results", async () => {
  const taskCounts: number[] = [];
  const stages: number[] = [];
  const progress: Array<[number, number]> = [];

  const result = await runProgressiveSurfaceSweep(
    { ...samplePayload(), pointsPerEdge: 11 },
    {
      onStage: (stage) => stages.push(stage.pointsPerEdge),
      onProgress: (done, total) => progress.push([done, total]),
      runBatches: async (tasks, onProgress) => {
        taskCounts.push(tasks.length);
        onProgress?.(tasks.length, tasks.length);
        return tasks.map((task) => ({
          attIdx: task.attIdx,
          defIdx: task.defIdx,
          winrate: task.attIdx === task.defIdx ? 0.5 : 0.75,
        }));
      },
    },
  );

  assert.deepEqual(stages, [6, 11]);
  assert.deepEqual(taskCounts, [441, 3915]);
  assert.deepEqual(progress.at(-1), [4356, 4356]);
  assert.equal(result.points.length, 66);
  assert.equal(result.winrateMatrix.length, 4356);
});

function samplePayload(): SurfaceSweepPayload {
  return {
    attacker: sampleSide(),
    defender: sampleSide(),
    pointsPerEdge: 2,
    total: 10,
    tier: "t1",
    replicates: 1,
    rallyMode: false,
    jobs: 2,
  };
}

function sampleSide(): SurfaceSweepPayload["attacker"] {
  return {
    troops: { infantry: 0, lancer: 0, marksman: 0 },
    troop_types: {
      infantry: "infantry_t1",
      lancer: "lancer_t1",
      marksman: "marksman_t1",
    },
    heroes: {
      infantry: { name: null, skills: [0, 0, 0, 0] },
      lancer: { name: null, skills: [0, 0, 0, 0] },
      marksman: { name: null, skills: [0, 0, 0, 0] },
    },
    joiners: [],
    stats: {
      inf: [0, 0, 0, 0],
      lanc: [0, 0, 0, 0],
      mark: [0, 0, 0, 0],
    },
  };
}
