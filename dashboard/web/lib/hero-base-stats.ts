import { HEROES } from "./heroes-catalogue";
import heroBaseStatsData from "../../../assets/hero_base_stats.json";

export type HeroStatCategory =
  | "SR"
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7";

export interface HeroBaseStats {
  attack: number;
  defense: number;
  lethality: number;
  health: number;
}

export const ZERO_STATS: HeroBaseStats = {
  attack: 0,
  defense: 0,
  lethality: 0,
  health: 0,
};

interface FighterHeroDefinition {
  stats?: Partial<Record<keyof HeroBaseStats, number>>;
}

interface HeroBaseStatsCategory {
  heroes: string[];
  stats: Partial<Record<keyof HeroBaseStats, number>>;
}

interface HeroBaseStatsData {
  categories: Record<HeroStatCategory, HeroBaseStatsCategory>;
  hero_overrides?: Record<string, FighterHeroDefinition>;
}

const SHARED_HERO_BASE_STATS =
  heroBaseStatsData as HeroBaseStatsData;

export const HERO_STAT_CATEGORY_MEMBERS: Record<HeroStatCategory, string[]> =
  Object.fromEntries(
    Object.entries(SHARED_HERO_BASE_STATS.categories).map(
      ([category, value]) => [category, value.heroes],
    ),
  ) as Record<HeroStatCategory, string[]>;

export const HERO_STAT_CATEGORY_BY_HERO: Record<string, HeroStatCategory> =
  Object.fromEntries(
    Object.entries(HERO_STAT_CATEGORY_MEMBERS).flatMap(([category, heroes]) =>
      heroes.map((hero) => [hero, category]),
    ),
  ) as Record<string, HeroStatCategory>;

function normalizeHeroName(name: string): string {
  return name.replace(/\s+/g, "");
}

function fillStats(
  stats: Partial<Record<keyof HeroBaseStats, number>>,
): HeroBaseStats {
  return {
    attack: stats.attack ?? 0,
    defense: stats.defense ?? 0,
    lethality: stats.lethality ?? 0,
    health: stats.health ?? 0,
  };
}

function buildHeroBaseStats(): Record<string, HeroBaseStats> {
  const overrides = SHARED_HERO_BASE_STATS.hero_overrides ?? {};
  const overridesByNormalizedName = new Map<string, FighterHeroDefinition>();
  for (const [name, definition] of Object.entries(overrides)) {
    overridesByNormalizedName.set(normalizeHeroName(name), definition);
  }

  const out: Record<string, HeroBaseStats> = {};
  for (const category of Object.values(SHARED_HERO_BASE_STATS.categories)) {
    for (const hero of category.heroes) {
      const override =
        overridesByNormalizedName.get(normalizeHeroName(hero))?.stats ?? {};
      out[hero] = fillStats({ ...category.stats, ...override });
    }
  }
  return out;
}

export const HERO_BASE_STATS: Record<string, HeroBaseStats> =
  buildHeroBaseStats();

export const HERO_BASE_STATS_BY_CATEGORY: Record<
  HeroStatCategory,
  Record<string, HeroBaseStats>
> = Object.fromEntries(
  Object.entries(HERO_STAT_CATEGORY_MEMBERS).map(([category, heroes]) => [
    category,
    Object.fromEntries(heroes.map((hero) => [hero, heroBaseStats(hero)])),
  ]),
) as Record<HeroStatCategory, Record<string, HeroBaseStats>>;

export function heroBaseStats(name: string | null): HeroBaseStats {
  if (!name) return ZERO_STATS;
  return HERO_BASE_STATS[name] ?? ZERO_STATS;
}

/** Dev-only check that every hero in the catalogue has an entry here. */
export function _assertCatalogueCoverage(): string[] {
  const missing: string[] = [];
  for (const h of HEROES) {
    if (!(h.name in HERO_BASE_STATS)) missing.push(h.name);
  }
  return missing;
}

/** Dev-only check that every hero in the catalogue has a stat category. */
export function _assertCategoryCoverage(): string[] {
  const missing: string[] = [];
  for (const h of HEROES) {
    if (!(h.name in HERO_STAT_CATEGORY_BY_HERO)) missing.push(h.name);
  }
  return missing;
}
