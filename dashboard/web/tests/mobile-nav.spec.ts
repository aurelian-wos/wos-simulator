import { test, expect } from "@playwright/test";

const IPHONE_SE = { width: 375, height: 667 };
const DESKTOP = { width: 1280, height: 800 };

test.describe("WOS-202 mobile nav + simulate layout", () => {
  test("primary routes stay within the mobile viewport and keep key controls readable", async ({
    page,
  }) => {
    await page.setViewportSize(IPHONE_SE);

    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    for (const route of ["/", "/runs", "/coverage", "/heroes", "/testcases", "/simulate"]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
        };
      });
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }

    await page.goto("/");
    const homeHeaderLayout = await page
      .locator('[data-testid="card-regressions"] header')
      .evaluate((el) => getComputedStyle(el).flexDirection);
    expect(homeHeaderLayout).toBe("column");

    await page.goto("/testcases");
    const filterInput = page.locator('[data-testid="testcases-index-path-filter"]');
    const filterBox = await filterInput.boundingBox();
    expect(filterBox).not.toBeNull();
    expect((filterBox?.width ?? 0) + 0.5).toBeGreaterThanOrEqual(240);

    expect(errors).toHaveLength(0);
  });

  test("mobile viewport hides sidebar and exposes hamburger drawer", async ({ page }) => {
    await page.setViewportSize(IPHONE_SE);

    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/simulate");
    expect(response?.status()).toBe(200);

    // Desktop sidebar is still in DOM (hidden md:flex) but must not be visible.
    await expect(page.locator("nav a[href='/simulate']").first()).not.toBeVisible();

    // Hamburger trigger exists and is visible.
    const trigger = page.getByRole("button", { name: /Open menu/i });
    await expect(trigger).toBeVisible();

    // Drawer opens on tap; the simulate link inside becomes visible.
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: /Site navigation/i });
    await expect(drawer).toBeVisible();
    const simulateLink = drawer.locator("a[href='/simulate']");
    await expect(simulateLink).toBeVisible();

    // Drawer closes with Escape.
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);

    expect(errors).toHaveLength(0);
  });

  test("simulate page fits mobile viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize(IPHONE_SE);

    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/simulate");
    expect(response?.status()).toBe(200);

    // Title + both side panel titles rendered.
    await expect(page.locator("h2")).toContainText("Simulate Battle");
    await expect(
      page.getByRole("heading", { name: "Attacker", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Defender", exact: true }),
    ).toBeVisible();

    await page.getByLabel("Rally mode").first().check();
    await page.locator('select[aria-label="marksman hero"]').first().selectOption("Alonso");
    const preview = page.locator(
      '[data-testid="stat-preview-attacker-infantry-lethality"]',
    );
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("[115]");
    await expect(preview).toContainText("+15.0%");

    // Simulate button touch-target is at least 44px tall (Apple HIG minimum).
    const simulateBtn = page.getByRole("button", { name: /^Simulate$/i });
    const box = await simulateBtn.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.height ?? 0) + 0.5).toBeGreaterThanOrEqual(44);

    // No horizontal scroll on the body.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    expect(errors).toHaveLength(0);
  });

  test("desktop viewport shows sidebar nav and no mobile trigger", async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/simulate");
    expect(response?.status()).toBe(200);

    // Sidebar link visible without any interaction.
    await expect(page.locator("nav a[href='/simulate']").first()).toBeVisible();

    // Mobile hamburger is rendered (md:hidden) but must not be visible on desktop.
    await expect(page.getByRole("button", { name: /Open menu/i })).not.toBeVisible();

    await page.getByLabel("Rally mode").first().check();
    await page.locator('select[aria-label="marksman hero"]').first().selectOption("Alonso");
    const preview = page.locator(
      '[data-testid="stat-preview-attacker-infantry-lethality"]',
    );
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("[115]");
    await expect(preview).toContainText("+15.0%");

    // Stat labels stay inline with their inputs on desktop, so the inputs
    // don't expand to full column width for small numeric values even with the
    // stacked effective-stat preview shown.
    const infantryAttackField = page
      .locator("label")
      .filter({ has: page.getByLabel("Infantry Lethality") })
      .first();
    const statLayout = await infantryAttackField.evaluate((el) => {
      const row = el.firstElementChild as HTMLElement | null;
      const input = el.querySelector("input") as HTMLInputElement | null;
      return {
        flexDirection: row ? getComputedStyle(row).flexDirection : null,
        inputWidth: input?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(statLayout.flexDirection).toBe("row");
    expect(statLayout.inputWidth).toBeLessThan(120);

    expect(errors).toHaveLength(0);
  });
});
