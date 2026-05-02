import { HEROES } from "./heroes-catalogue";
import fightersHeroes from "../../../fighters_data/fighters_heroes.json";

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

interface FighterHeroData {
  max?: Record<string, FighterHeroDefinition>;
}

function normalizeHeroName(name: string): string {
  return name.replace(/\s+/g, "");
}

function buildHeroBaseStats(): Record<string, HeroBaseStats> {
  const maxHeroes = (fightersHeroes as FighterHeroData).max ?? {};
  const byNormalizedName = new Map<string, FighterHeroDefinition>();
  for (const [name, definition] of Object.entries(maxHeroes)) {
    byNormalizedName.set(normalizeHeroName(name), definition);
  }

  const out: Record<string, HeroBaseStats> = {};
  for (const hero of HEROES) {
    const definition = byNormalizedName.get(normalizeHeroName(hero.name));
    const stats = definition?.stats ?? {};
    out[hero.name] = {
      attack: stats.attack ?? 0,
      defense: stats.defense ?? 0,
      lethality: stats.lethality ?? 0,
      health: stats.health ?? 0,
    };
  }
  return out;
}

export const HERO_BASE_STATS: Record<string, HeroBaseStats> =
  buildHeroBaseStats();

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
