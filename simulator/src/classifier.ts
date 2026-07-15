import type { ActiveEffect, DamageJob, SideId, UnitType } from "./types";
import { unitMaskHas } from "./types";
import { bucketDefinition, passiveBucketRole, type BucketName, type PassiveBucket } from "./damageBuckets";

export interface Classification {
  kind: "bucket" | "control" | "extra_skill_attack" | "battle_order" | "report_only";
  bucket?: BucketName | PassiveBucket;
  control?: "dodge" | "no_attack";
  reason?: string;
}

export function classifyEffectForJob(effect: ActiveEffect, job: DamageJob): Classification | undefined {
  const type = effect.intent.type;
  if (type === "dodge" || type === "no_attack") {
    if (!controlEffectApplies(effect, job, type)) return { kind: "report_only", reason: "not_applicable_to_job" };
    return { kind: "control", control: type };
  }

  if (!basicEffectApplies(effect, job)) return { kind: "report_only", reason: "not_applicable_to_job" };
  if (type === "extra_skill_attack") return { kind: "extra_skill_attack" };
  if (type === "attack_order") return { kind: "battle_order" };

  const definition = bucketDefinition(type);
  const passiveRole = passiveBucketRole(type);
  if ((!definition || definition.valueType !== "pct") && !passiveRole) return { kind: "report_only", reason: unsupportedReason(effect, job) };
  if (passiveRole) {
    if (passiveRole === "dealer" && effect.appliesTo.side === job.dealerSide) return { kind: "bucket", bucket: type as PassiveBucket };
    if (passiveRole === "taker" && effect.appliesTo.side === job.takerSide) return { kind: "bucket", bucket: type as PassiveBucket };
    return { kind: "report_only", reason: unsupportedReason(effect, job) };
  }
  if (!definition) return { kind: "report_only", reason: unsupportedReason(effect, job) };
  if (definition.phase !== "dynamic") return { kind: "report_only", reason: unsupportedReason(effect, job) };
  if (definition.appliesTo !== undefined && definition.appliesTo !== job.kind) return { kind: "report_only", reason: "not_applicable_to_job_kind" };
  if (definition.role === "dealer" && effect.appliesTo.side === job.dealerSide) return { kind: "bucket", bucket: definition.path };
  if (definition.role === "taker" && effect.appliesTo.side === job.takerSide) return { kind: "bucket", bucket: definition.path };
  return { kind: "report_only", reason: unsupportedReason(effect, job) };
}

export function basicEffectApplies(effect: ActiveEffect, job: DamageJob): boolean {
  const affectedUnit = unitForSide(effect.appliesTo.side, job);
  if (!affectedUnit || !unitMaskHas(effect.appliesTo.units, affectedUnit)) return false;
  const opposingUnit = unitForSide(effect.appliesVs.side, job);
  if (!opposingUnit || !unitMaskHas(effect.appliesVs.units, opposingUnit)) return false;
  return true;
}

function controlEffectApplies(effect: ActiveEffect, job: DamageJob, control: "dodge" | "no_attack"): boolean {
  const appliesToSide = control === "no_attack" ? job.dealerSide : job.takerSide;
  const appliesToUnit = control === "no_attack" ? job.dealerUnit : job.takerUnit;
  if (effect.appliesTo.side !== appliesToSide || !unitMaskHas(effect.appliesTo.units, appliesToUnit)) return false;

  const appliesVsSide = control === "no_attack" ? job.takerSide : job.dealerSide;
  const appliesVsUnit = control === "no_attack" ? job.takerUnit : job.dealerUnit;
  return effect.appliesVs.side === appliesVsSide && unitMaskHas(effect.appliesVs.units, appliesVsUnit);
}

function unsupportedReason(effect: ActiveEffect, job: DamageJob): string {
  if (effect.appliesTo.side === job.dealerSide) return "unsupported_dealer_effect";
  if (effect.appliesTo.side === job.takerSide) return "unsupported_taker_effect";
  return "wrong_side";
}

function unitForSide(side: SideId, job: DamageJob): UnitType | undefined {
  if (side === job.dealerSide) return job.dealerUnit;
  if (side === job.takerSide) return job.takerUnit;
  return undefined;
}
