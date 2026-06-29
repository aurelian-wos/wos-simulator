import assert from "node:assert/strict";
import { test } from "node:test";

import {
  attackerSurfaceValues,
  buildInitialSurfaceState,
  defenderSurfaceValues,
  nextNullableNumberState,
  nextProgressState,
} from "./SurfaceClient";
import type { SavedSimulationRunResponse, SimulateSidePayload } from "@/lib/simulate-run";

function assertArrayClose(actual: number[], expected: number[]): void {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 1e-9, `index ${i}: expected ${expected[i]}, got ${actual[i]}`);
  }
}

test("surface cross-sections consistently use attacker winrate", () => {
  const matrix = [
    0.1, 0.8,
    0.2, 0.6,
  ];

  assertArrayClose(attackerSurfaceValues(matrix, 2, 1), [0.8, 0.6]);
  assertArrayClose(defenderSurfaceValues(matrix, 2, 0), [0.1, 0.8]);
});

test("surface panels use mean attacker winrates by default", () => {
  const matrix = [
    0.1, 0.8,
    0.2, 0.6,
  ];

  assertArrayClose(attackerSurfaceValues(matrix, 2, null), [0.45, 0.4]);
  assertArrayClose(defenderSurfaceValues(matrix, 2, null), [0.15, 0.7]);
});

test("surface progress state ignores duplicate progress events", () => {
  const prev = { done: 3, total: 10 };

  assert.equal(nextProgressState(prev, 3, 10), prev);
  assert.deepEqual(nextProgressState(prev, 4, 10), { done: 4, total: 10 });
});

test("surface progress state ignores noisy sub-percent progress events", () => {
  const prev = { done: 300, total: 100_000 };

  assert.equal(nextProgressState(prev, 350, 100_000), prev);
  assert.deepEqual(nextProgressState(prev, 1_200, 100_000), { done: 1_200, total: 100_000 });
  assert.deepEqual(nextProgressState(prev, 100_000, 100_000), { done: 100_000, total: 100_000 });
});

test("surface hover state ignores duplicate hover transitions", () => {
  assert.equal(nextNullableNumberState(null, null), null);
  assert.equal(nextNullableNumberState(4, 4), 4);
  assert.equal(nextNullableNumberState(4, null), null);
  assert.equal(nextNullableNumberState(null, 2), 2);
});

test("surface defaults to T11 FC10 for global troop tier", () => {
  const state = buildInitialSurfaceState(null, null);

  assert.equal(state.tier, "t11_fc10");
  assert.deepEqual(state.attacker.tiers, {
    infantry: "t11_fc10",
    lancer: "t11_fc10",
    marksman: "t11_fc10",
  });
  assert.deepEqual(state.defender.tiers, {
    infantry: "t11_fc10",
    lancer: "t11_fc10",
    marksman: "t11_fc10",
  });
});

test("surface initial state hydrates inputs and result from a saved surface run", () => {
  const saved = {
    version: 1,
    id: "surface-1",
    kind: "surface_sweep",
    created_at: "2026-06-27T12:00:00.000Z",
    share_url: "/surface?run=surface-1",
    request: {
      attacker: sampleSide("Edith", "Mia", "Alonso"),
      defender: sampleSide("Logan", "Gordon", "Bradley"),
      pointsPerEdge: 11,
      total: 123_456,
      tier: "t10",
      replicates: 7,
      rallyMode: true,
      jobs: 3,
    },
    result: {
      points: [{ inf: 123_456, lanc: 0, mark: 0 }],
      winrateMatrix: [0.8],
    },
  } satisfies SavedSimulationRunResponse;

  const state = buildInitialSurfaceState(saved, null);

  assert.equal(state.pointsPerEdge, 11);
  assert.equal(state.total, 123_456);
  assert.equal(state.tier, "t10");
  assert.equal(state.replicates, 7);
  assert.equal(state.rallyMode, true);
  assert.equal(state.jobs, 3);
  assert.equal(state.attacker.heroes.infantry.name, "Edith");
  assert.equal(state.defender.heroes.marksman.name, "Bradley");
  assert.deepEqual(state.result, saved.result);
  assert.equal(state.savedRunMeta?.shareUrl, "/surface?run=surface-1");
});

function sampleSide(infantry: string, lancer: string, marksman: string): SimulateSidePayload {
  return {
    troops: { infantry: 1, lancer: 1, marksman: 1 },
    troop_types: {
      infantry: "infantry_t6",
      lancer: "lancer_t6",
      marksman: "marksman_t6",
    },
    heroes: {
      infantry: { name: infantry, skills: [5, 5, 5, 5] },
      lancer: { name: lancer, skills: [5, 5, 5, 5] },
      marksman: { name: marksman, skills: [5, 5, 5, 5] },
    },
    joiners: [],
    stats: {
      inf: [100, 100, 100, 100],
      lanc: [100, 100, 100, 100],
      mark: [100, 100, 100, 100],
    },
  };
}
