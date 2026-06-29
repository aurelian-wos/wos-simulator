import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "../..");

test("surface role panels opt out of simulate mobile tab hiding", () => {
  const surfaceClient = readFileSync(resolve(import.meta.dirname, "SurfaceClient.tsx"), "utf8");
  const globals = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");

  assert.match(surfaceClient, /className="surface-role-grid sim-role-grid mb-4"/);
  assert.match(surfaceClient, /className="sim-start-toggles surface-start-toggles"/);
  assert.doesNotMatch(surfaceClient, /className="sim-role-swap-slot items-center justify-center"/);
  assert.match(globals, /\.surface-role-grid\s+\.sim-role-slot\s*{\s*display:\s*block;/);
  assert.match(globals, /\.surface-role-grid\.sim-role-grid\s*{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
});

test("surface start controls expose sync hero stats", () => {
  const surfaceClient = readFileSync(resolve(import.meta.dirname, "SurfaceClient.tsx"), "utf8");
  const globals = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");

  assert.match(surfaceClient, /const \[syncStatsOnHeroChange,\s*setSyncStatsOnHeroChange\] = useState\(true\);/);
  assert.match(surfaceClient, /Sync hero stats/);
  assert.match(surfaceClient, /aria-label="Update stats on hero change"/);
  assert.match(surfaceClient, /syncStatsOnHeroChange={syncStatsOnHeroChange}/);
  assert.doesNotMatch(surfaceClient, /syncStatsOnHeroChange={true}/);
  assert.match(globals, /\.surface-start-toggles\s*{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
});

test("surface page is labelled Ratio Explorer", () => {
  const surfaceClient = readFileSync(resolve(import.meta.dirname, "SurfaceClient.tsx"), "utf8");
  const surfacePage = readFileSync(resolve(import.meta.dirname, "page.tsx"), "utf8");
  const siteNav = readFileSync(resolve(webRoot, "components/SiteNav.tsx"), "utf8");

  assert.match(surfaceClient, /Ratio Explorer/);
  assert.match(surfacePage, /Ratio Explorer/);
  assert.match(siteNav, /Ratio Explorer/);
  assert.doesNotMatch(surfaceClient, /Troop Ratio Surface|Ratio Surface/);
  assert.doesNotMatch(surfacePage, /Troop Ratio Surface|Ratio Surface/);
  assert.doesNotMatch(siteNav, /Ratio Surface/);
});

test("surface result triangles label the color perspective consistently", () => {
  const surfaceClient = readFileSync(resolve(import.meta.dirname, "SurfaceClient.tsx"), "utf8");
  const ternaryPanel = readFileSync(resolve(webRoot, "components/TernaryPanel.tsx"), "utf8");

  assert.match(surfaceClient, /Blue is defender-favored, white is even, and red is attacker-favored/);
  assert.match(surfaceClient, /average matchup outcome/);
  assert.doesNotMatch(surfaceClient, /Color: attacker winrate|lower is better for defenders|Attacker WR/);
  assert.match(surfaceClient, /showLegend={false}/);
  assert.match(surfaceClient, /<WinrateLegend \/>/);
  assert.match(ternaryPanel, /subtitle\?: string;/);
  assert.match(ternaryPanel, /showLegend\?: boolean;/);
  assert.doesNotMatch(ternaryPanel, /valueLabel|Attacker WR/);
  assert.match(ternaryPanel, /Outcome: \$\{\(\(1 - v\) \* 100\)\.toFixed\(1\)\}% defender/);
  assert.match(ternaryPanel, /style=\{\{ width: "100%", maxWidth: "100%", display: "block" \}\}/);
  assert.match(ternaryPanel, /100% defender wins/);
  assert.match(ternaryPanel, /50 \/ 50/);
  assert.match(ternaryPanel, /100% attacker wins/);
});

test("surface run actions keep the generate button at its content width", () => {
  const surfaceClient = readFileSync(resolve(import.meta.dirname, "SurfaceClient.tsx"), "utf8");
  const globals = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");

  assert.match(surfaceClient, /className="sim-runbar surface-runbar mb-4"/);
  assert.match(surfaceClient, /Generate surface/);
  assert.match(globals, /\.sim-runbar\.surface-runbar\s*{\s*grid-template-columns:\s*max-content minmax\(0,\s*1fr\);/);
  assert.match(globals, /\.sim-top-actions\s+\.sim-runbar\.surface-runbar\s*{\s*grid-template-columns:\s*max-content minmax\(0,\s*1fr\);/);
  assert.match(globals, /\.sim-runbar\.surface-runbar\s+\.sim-run-button\s*{[\s\S]*?white-space:\s*nowrap;/);
});

test("surface action dock puts shadow on the visible card", () => {
  const surfaceClient = readFileSync(resolve(import.meta.dirname, "SurfaceClient.tsx"), "utf8");
  const globals = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");

  assert.match(surfaceClient, /className="sim-top-actions surface-action-dock"/);
  assert.match(surfaceClient, /className="sim-action-card sim-action-card-run surface-action-card"/);
  assert.match(globals, /\.sim-top-actions\.surface-action-dock\s*{\s*box-shadow:\s*none;/);
  assert.match(globals, /\.surface-action-dock\s+\.surface-action-card\s*{[\s\S]*?box-shadow:\s*0 -12px 28px rgba\(16,\s*19,\s*29,\s*0\.42\);/);
});

test("surface army panels use the global tier instead of row tier controls", () => {
  const surfaceClient = readFileSync(resolve(import.meta.dirname, "SurfaceClient.tsx"), "utf8");

  assert.equal((surfaceClient.match(/fixedTroopTier={tier}/g) ?? []).length, 2);
});
