import { expect, test } from "@playwright/test";
import {
  estimateAdaptiveBattleCount,
  estimateAdaptiveCompositionCount,
  estimateCompositionCount,
  recommendedOptimizeStep,
  resolveInfantryBounds,
} from "../lib/optimize-ratio";

test.describe("optimize-ratio helpers", () => {
  test("recommended step scales to about thirty buckets across the army total", () => {
    expect(recommendedOptimizeStep(3000)).toBe(100);
    expect(recommendedOptimizeStep(150000)).toBe(5000);
  });

  test("composition count defaults to the bounded infantry search band", () => {
    expect(estimateCompositionCount(3000, 100)).toBe(208);
    expect(estimateCompositionCount(150000, 5000)).toBe(208);
    expect(estimateCompositionCount(3000, 1000)).toBe(5);
  });

  test("adaptive search estimate uses the 30 to 70 infantry 5 percent grid", () => {
    expect(estimateAdaptiveCompositionCount()).toBe(1119);
    expect(estimateAdaptiveBattleCount()).toBe(16770);
    expect(estimateAdaptiveCompositionCount(25, 75)).toBe(1141);
    expect(estimateAdaptiveBattleCount(25, 75)).toBe(17430);
  });

  test("composition count still supports full simplex searches when explicitly requested", () => {
    expect(estimateCompositionCount(3000, 100, 0, 100)).toBe(496);
    expect(estimateCompositionCount(150000, 5000, 0, 100)).toBe(496);
    expect(estimateCompositionCount(3500, 100, 0, 100)).toBe(666);
  });

  test("infantry bounds are clamped and validated", () => {
    expect(resolveInfantryBounds(30, 70)).toEqual({
      minPct: 30,
      maxPct: 70,
      isValid: true,
    });
    expect(resolveInfantryBounds(-10, 120)).toEqual({
      minPct: 0,
      maxPct: 100,
      isValid: true,
    });
    expect(resolveInfantryBounds(80, 20)).toEqual({
      minPct: 80,
      maxPct: 20,
      isValid: false,
    });
  });
});
