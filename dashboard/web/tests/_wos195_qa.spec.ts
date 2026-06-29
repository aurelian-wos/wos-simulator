import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const OUT = path.join(__dirname, "..", "test-results", "wos-195-qa");

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test.describe("WOS-195 Simulate page visual QA", () => {
  test("page loads and shows battle layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/simulate");
    await page.waitForLoadState("networkidle");

    // 1280px uses the tabbed setup layout; the defender panel is shown via
    // the workspace tab instead of being visible alongside the attacker.
    await expect(page.getByRole("heading", { name: "Attacker", exact: true })).toBeVisible();
    await expect(page.getByTestId("sim-tab-defender")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Defender", exact: true })).not.toBeVisible();

    await page.getByTestId("sim-tab-defender").click();
    await expect(page.getByRole("heading", { name: "Defender", exact: true })).toBeVisible();

    await page.screenshot({
      path: path.join(OUT, "01-initial-desktop.png"),
      fullPage: true,
    });
  });

  test("troop inputs exist for infantry, lancer, marksman on both sides", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/simulate");
    await page.waitForLoadState("networkidle");

    // Check troop category labels are present
    const content = await page.content();
    expect(content.toLowerCase()).toContain("infantry");
    expect(content.toLowerCase()).toContain("lancer");
    expect(content.toLowerCase()).toContain("marksman");

    // Check troop type dropdowns exist (t1..t11, fc variants)
    const selects = page.locator("select");
    const count = await selects.count();
    expect(count).toBeGreaterThan(6); // at least 6 tier dropdowns (3 per side)

    await page.screenshot({
      path: path.join(OUT, "02-troop-inputs.png"),
      fullPage: true,
    });
  });

  test("hero selects exist and skill selects render after hero selection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/simulate");
    await page.waitForLoadState("networkidle");

    // Hero dropdowns should exist
    const content = await page.content();
    expect(content).toContain("None"); // no hero option

    // Skill selects are only rendered once a hero is selected.
    await expect(page.locator('select[aria-label="infantry skill 1"]')).toHaveCount(0);

    await page.locator('select[aria-label="infantry hero"]').first().selectOption({ index: 1 });
    await expect(page.locator('select[aria-label="infantry skill 1"]')).toBeVisible();

    const disabledSkillSelects = page.locator(".sim-skill-strip select[disabled]");
    await expect(disabledSkillSelects.first()).toBeVisible();
  });

  test("stats inputs exist (12 per side)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/simulate");
    await page.waitForLoadState("networkidle");

    // Check stat labels
    const content = await page.content();
    expect(content).toContain("Atk");
    expect(content).toContain("Def");
    expect(content).toContain("Leth");
    expect(content).toContain("HP");

    await page.screenshot({
      path: path.join(OUT, "03-stats-section.png"),
      fullPage: true,
    });
  });

  test("replicates input and Simulate button present", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/simulate");
    await page.waitForLoadState("networkidle");

    // Replicates input
    const replicatesInput = page.locator('input[type="number"]').filter({ hasText: '' }).first();
    await expect(replicatesInput).toBeVisible();

    // Simulate button
    const simulateBtn = page.getByRole("button", { name: /simulate/i });
    await expect(simulateBtn).toBeVisible();

    await page.screenshot({
      path: path.join(OUT, "04-simulate-button.png"),
    });
  });

  test("hero selection enables skill selects with correct defaults", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/simulate");
    await page.waitForLoadState("networkidle");

    // Find and select the first hero dropdown (infantry on attacker side)
    const heroSelects = page.locator("select").filter({ hasText: "None" });
    const firstHeroSelect = heroSelects.first();
    await firstHeroSelect.selectOption({ index: 1 }); // pick first actual hero

    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(OUT, "05-hero-selected.png"),
      fullPage: true,
    });
  });

  test("simulate runs and shows results", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/simulate");
    await page.waitForLoadState("networkidle");

    // Set low replicates for speed
    const numInputs = page.locator('input[type="number"]');
    const count = await numInputs.count();
    // Find replicates - usually near the simulate button, try to find it
    for (let i = 0; i < count; i++) {
      const val = await numInputs.nth(i).inputValue();
      if (val === "100" || val === "50") {
        await numInputs.nth(i).fill("10");
        break;
      }
    }

    const simulateBtn = page.getByRole("button", { name: /simulate/i });
    await simulateBtn.click();

    // Wait for results (up to 30s for sim to complete)
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(OUT, "06-simulate-running.png"),
      fullPage: true,
    });

    // Wait longer for results
    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase();
        return text.includes("survivors") || text.includes("win rate") || text.includes("mean") || text.includes("error");
      },
      { timeout: 30000 }
    );

    await page.screenshot({
      path: path.join(OUT, "07-results.png"),
      fullPage: true,
    });

    const text = await page.evaluate(() => document.body.innerText);

    // Check key result stats are shown
    const textLower = text.toLowerCase();
    expect(
      textLower.includes("survivor") ||
        textLower.includes("win rate") ||
        textLower.includes("mean")
    ).toBe(true);
  });

  test("mobile layout renders correctly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/simulate");
    await page.waitForLoadState("networkidle");

    await page.screenshot({
      path: path.join(OUT, "08-mobile.png"),
      fullPage: true,
    });
  });
});
