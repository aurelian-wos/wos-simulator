import ahmoseSkills from "../../../assets/hero_skills/Ahmose.json";
import alonsoSkills from "../../../assets/hero_skills/Alonso.json";
import bahitiSkills from "../../../assets/hero_skills/Bahiti.json";
import bradleySkills from "../../../assets/hero_skills/Bradley.json";
import edithSkills from "../../../assets/hero_skills/Edith.json";
import flintSkills from "../../../assets/hero_skills/Flint.json";
import gordonSkills from "../../../assets/hero_skills/Gordon.json";
import gregSkills from "../../../assets/hero_skills/Greg.json";
import gwenSkills from "../../../assets/hero_skills/Gwen.json";
import hectorSkills from "../../../assets/hero_skills/Hector.json";
import jasserSkills from "../../../assets/hero_skills/Jasser.json";
import jeronimoSkills from "../../../assets/hero_skills/Jeronimo.json";
import jessieSkills from "../../../assets/hero_skills/Jessie.json";
import lingSkills from "../../../assets/hero_skills/Ling.json";
import loganSkills from "../../../assets/hero_skills/Logan.json";
import lumakSkills from "../../../assets/hero_skills/Lumak.json";
import lynnSkills from "../../../assets/hero_skills/Lynn.json";
import miaSkills from "../../../assets/hero_skills/Mia.json";
import mollySkills from "../../../assets/hero_skills/Molly.json";
import nataliaSkills from "../../../assets/hero_skills/Natalia.json";
import norahSkills from "../../../assets/hero_skills/Norah.json";
import patrickSkills from "../../../assets/hero_skills/Patrick.json";
import phillySkills from "../../../assets/hero_skills/Philly.json";
import reinaSkills from "../../../assets/hero_skills/Reina.json";
import reneeSkills from "../../../assets/hero_skills/Renee.json";
import seoyoonSkills from "../../../assets/hero_skills/Seo-yoon.json";
import sergeySkills from "../../../assets/hero_skills/Sergey.json";
import wayneSkills from "../../../assets/hero_skills/Wayne.json";
import wumingSkills from "../../../assets/hero_skills/WuMing.json";
import zinmanSkills from "../../../assets/hero_skills/Zinman.json";

export type TroopCategory = "infantry" | "lancer" | "marksman";
export type Skill4Role = "attack" | "defense" | "rally";
export type Skill4Stat = "attack" | "defense" | "lethality" | "health";

export interface Skill4Info {
  role: Skill4Role;
  stat: Skill4Stat;
}

export interface HeroEntry {
  name: string;
  categories: TroopCategory[];
  skillCount: number;
  skillNums: number[];
  skill4?: Skill4Info;
}

interface HeroSkillEffect {
  effect_type?: string;
  effect_values?: Record<string, number | string>;
  special?: Record<string, unknown>;
}

interface HeroSkillDefinition {
  skill_num?: number;
  skill_effects?: HeroSkillEffect[];
}

interface HeroSpec {
  name: string;
  categories: TroopCategory[];
  skills: readonly HeroSkillDefinition[];
}

const HERO_SKILL_DATA = {
  Ahmose: ahmoseSkills,
  Alonso: alonsoSkills,
  Bahiti: bahitiSkills,
  Bradley: bradleySkills,
  Edith: edithSkills,
  Flint: flintSkills,
  Gordon: gordonSkills,
  Greg: gregSkills,
  Gwen: gwenSkills,
  Hector: hectorSkills,
  Jasser: jasserSkills,
  Jeronimo: jeronimoSkills,
  Jessie: jessieSkills,
  Ling: lingSkills,
  Logan: loganSkills,
  Lumak: lumakSkills,
  Lynn: lynnSkills,
  Mia: miaSkills,
  Molly: mollySkills,
  Natalia: nataliaSkills,
  Norah: norahSkills,
  Patrick: patrickSkills,
  Philly: phillySkills,
  Reina: reinaSkills,
  Renee: reneeSkills,
  "Seo-yoon": seoyoonSkills,
  Sergey: sergeySkills,
  Wayne: wayneSkills,
  WuMing: wumingSkills,
  Zinman: zinmanSkills,
} satisfies Record<string, readonly HeroSkillDefinition[]>;

const HERO_SPECS: HeroSpec[] = [
  { name: "Ahmose", categories: ["infantry"], skills: HERO_SKILL_DATA.Ahmose },
  { name: "Alonso", categories: ["marksman"], skills: HERO_SKILL_DATA.Alonso },
  { name: "Bahiti", categories: ["marksman"], skills: HERO_SKILL_DATA.Bahiti },
  { name: "Bradley", categories: ["marksman"], skills: HERO_SKILL_DATA.Bradley },
  { name: "Edith", categories: ["infantry"], skills: HERO_SKILL_DATA.Edith },
  { name: "Flint", categories: ["infantry"], skills: HERO_SKILL_DATA.Flint },
  { name: "Gordon", categories: ["lancer"], skills: HERO_SKILL_DATA.Gordon },
  { name: "Greg", categories: ["marksman"], skills: HERO_SKILL_DATA.Greg },
  { name: "Gwen", categories: ["marksman"], skills: HERO_SKILL_DATA.Gwen },
  { name: "Hector", categories: ["infantry"], skills: HERO_SKILL_DATA.Hector },
  { name: "Jasser", categories: ["marksman"], skills: HERO_SKILL_DATA.Jasser },
  { name: "Jeronimo", categories: ["infantry"], skills: HERO_SKILL_DATA.Jeronimo },
  { name: "Jessie", categories: ["lancer"], skills: HERO_SKILL_DATA.Jessie },
  { name: "Ling", categories: ["lancer"], skills: HERO_SKILL_DATA.Ling },
  { name: "Logan", categories: ["infantry"], skills: HERO_SKILL_DATA.Logan },
  { name: "Lumak", categories: ["lancer"], skills: HERO_SKILL_DATA.Lumak },
  { name: "Lynn", categories: ["marksman"], skills: HERO_SKILL_DATA.Lynn },
  { name: "Mia", categories: ["lancer"], skills: HERO_SKILL_DATA.Mia },
  { name: "Molly", categories: ["lancer", "marksman"], skills: HERO_SKILL_DATA.Molly },
  { name: "Natalia", categories: ["infantry"], skills: HERO_SKILL_DATA.Natalia },
  { name: "Norah", categories: ["lancer"], skills: HERO_SKILL_DATA.Norah },
  { name: "Patrick", categories: ["lancer"], skills: HERO_SKILL_DATA.Patrick },
  { name: "Philly", categories: ["lancer"], skills: HERO_SKILL_DATA.Philly },
  { name: "Reina", categories: ["lancer"], skills: HERO_SKILL_DATA.Reina },
  { name: "Renee", categories: ["lancer"], skills: HERO_SKILL_DATA.Renee },
  { name: "Seo-yoon", categories: ["marksman"], skills: HERO_SKILL_DATA["Seo-yoon"] },
  { name: "Sergey", categories: ["infantry"], skills: HERO_SKILL_DATA.Sergey },
  { name: "Wayne", categories: ["marksman"], skills: HERO_SKILL_DATA.Wayne },
  { name: "WuMing", categories: ["infantry"], skills: HERO_SKILL_DATA.WuMing },
  { name: "Zinman", categories: ["marksman"], skills: HERO_SKILL_DATA.Zinman },
];

function isSkill4Role(value: string | undefined): value is Skill4Role {
  return value === "attack" || value === "defense" || value === "rally";
}

function isSkill4Stat(value: string | undefined): value is Skill4Stat {
  return (
    value === "attack" ||
    value === "defense" ||
    value === "lethality" ||
    value === "health"
  );
}

function skill4FromDefinitions(
  skills: readonly HeroSkillDefinition[],
): Skill4Info | undefined {
  const skill4 = skills.find((skill) => skill.skill_num === 4);
  const statBonus = skill4?.skill_effects?.find(
    (effect) => effect.effect_type === "StatBonus",
  );
  const role =
    typeof statBonus?.special?.role === "string"
      ? statBonus.special.role
      : undefined;
  const stat =
    typeof statBonus?.special?.stat === "string"
      ? statBonus.special.stat
      : undefined;
  if (!isSkill4Role(role) || !isSkill4Stat(stat)) return undefined;
  return { role, stat };
}

function skill4ValuesFromDefinitions(
  specs: readonly HeroSpec[],
): readonly number[] {
  const values = specs
    .flatMap((spec) => spec.skills)
    .find((skill) => skill.skill_num === 4)
    ?.skill_effects?.find((effect) => effect.effect_type === "StatBonus")
    ?.effect_values;
  return [0, 1, 2, 3, 4, 5].map((level) => {
    if (level === 0) return 0;
    const raw = values?.[String(level)];
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) ? value : 0;
  });
}

export const SKILL4_VALUES: readonly number[] =
  skill4ValuesFromDefinitions(HERO_SPECS);

export const HEROES: HeroEntry[] = HERO_SPECS.map((spec) => {
  const skillNums = spec.skills
    .map((skill) => skill.skill_num)
    .filter((num): num is number => typeof num === "number")
    .sort((a, b) => a - b);
  return {
    name: spec.name,
    categories: spec.categories,
    skillCount: skillNums.length,
    skillNums,
    skill4: skill4FromDefinitions(spec.skills),
  };
});

/**
 * Whether a hero's skill_4 (if present) is active for a given side in rally mode.
 * - Attacker (rally leader): role "attack" skills active.
 * - Rally-role widgets are also active on the attacking side; this mirrors the
 *   dashboard simulator patch for skills whose source data says role "rally".
 * - Defender: only "defense" is active.
 * Heroes without a skill_4 always return false.
 */
export function skill4ActiveForSide(
  hero: HeroEntry | undefined,
  side: "attacker" | "defender",
): boolean {
  if (!hero?.skill4) return false;
  const role = hero.skill4.role;
  if (side === "attacker") return role === "attack" || role === "rally";
  return role === "defense";
}

/** Percent value for a hero's skill_4 at a given level (0..5). */
export function skill4PercentAt(level: number): number {
  if (level < 1 || level > 5) return 0;
  return SKILL4_VALUES[level] ?? 0;
}

export function heroesForCategory(cat: TroopCategory): HeroEntry[] {
  return HEROES.filter((h) => h.categories.includes(cat));
}

export function getHero(name: string | null): HeroEntry | undefined {
  if (!name) return undefined;
  return HEROES.find((h) => h.name === name);
}

/**
 * Per spec:
 * - No hero: all 4 slots disabled, value 0.
 * - Hero with 3+ skills: slots 1-3 enabled (default 5). Slot 4 disabled unless rally mode.
 * - Hero with 2 skills: slots 1-2 enabled (default 5). Slots 3 & 4 disabled.
 * - Rally mode: slot 4 enabled for heroes whose skillCount is 4 (i.e. they have a skill_4).
 */
export function skillSlotEnabled(
  hero: HeroEntry | undefined,
  slot: 1 | 2 | 3 | 4,
  rallyMode = false,
): boolean {
  if (!hero) return false;
  if (slot === 4) return rallyMode && hero.skillCount >= 4;
  if (hero.skillCount >= 3) return slot <= 3;
  return slot <= 2;
}

export const TROOP_TIERS: string[] = (() => {
  const out: string[] = [];
  for (let t = 1; t <= 9; t++) out.push(`t${t}`);
  out.push("t10");
  for (let fc = 1; fc <= 8; fc++) out.push(`t10_fc${fc}`);
  out.push("t11");
  for (let fc = 1; fc <= 8; fc++) out.push(`t11_fc${fc}`);
  return out;
})();

export function troopKey(category: TroopCategory, tier: string): string {
  // Normalize "marksman" -> "marksman" (simulator uses "marksman_tN" keys).
  return `${category}_${tier}`;
}
