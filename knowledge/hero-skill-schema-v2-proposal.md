# Hero Skill Schema V2 Proposal

WOS-277 asks for a clearer hero skill definition shape without wiring it into
the current simulator. The proposed full catalogue is
`assets/hero_skills_v2_proposed.json`.

## Scope

This is a proposal artifact only. It is intentionally not code-compatible with
`Base_classes.Skill` and should not be loaded by runtime code until a later
migration task defines an adapter.

The proposal was derived from every file in `assets/hero_skills/`:

- 30 heroes
- 104 current skill entries
- 114 current effects
- 22 slot-4 widget skills
- 5 no-effect non-combat placeholders

After separating widgets, the proposed catalogue contains:

- 77 combat skills
- 92 combat effects
- 22 widgets
- 5 non-combat placeholders

The 92 combat effects plus 22 widget effects account for all 114 current
effects.

## Schema Shape

The proposal uses this top-level shape:

```json
{
  "schemaVersion": "hero-skill-proposal-v2",
  "defaults": {},
  "vocabulary": {},
  "reservedButNotUsedByCurrentHeroCatalog": {},
  "heroes": []
}
```

Each hero has:

- `hero`
- `troop`
- optional `aliases`
- `skills` for combat skills
- optional `widget` for slot-4 widget stat bonuses
- optional `nonCombatSkills` for known no-effect placeholders

Each combat skill keeps only semantic data:

- `slot`, `name`, `text`
- optional `activation`
- `effects`

Each effect keeps the shared Benefit concepts needed by tracing and residual
grouping:

- `type` and `op`
- optional `side`
- optional `damageKind`
- optional `damagePass`
- optional `targeting`
- optional `duration`
- optional `valuePctByLevel`
- optional `chancePctByLevel`
- optional explicit former-`special` concepts

## Defaults

The current files repeat many implementation defaults. V2 omits these unless a
skill or effect differs:

- hero source is `hero_skill`
- skill activation is passive and battle-long
- skills are not same-round stackable
- skills do not require their base troop type to remain alive
- skill order is `1`
- effects apply to self
- effects are normal modifiers, not extra attacks
- effects apply to both normal and extra passes
- effects trigger from all troop types against all troop types
- effects benefit the triggering troop type against any current target
- effect duration is battle-long
- effects are deterministic

## Concept Mapping

Current skill-level fields map as follows:

| Current field | V2 concept |
|---|---|
| `skill_hero` | parent hero name |
| `skill_troop_type` | hero `troop` |
| `skill_num` | skill `slot` or widget `slot` |
| `skill_name` | `name` |
| `skill_description` | `text` |
| `skill_permanent=false` + `skill_frequency` | `activation.every` |
| `skill_first_round` | `activation.first` |
| `skill_last_round` | `activation.last` |
| `skill_is_chance` / `skill_probability` | `activation.chancePct` |
| `skill_round_stackable` | `activation.stack: "same_round"` |
| `skill_type_relation` | `activation.requiresTroopAlive` |
| `skill_order != 1` | `activation.order` |

Current effect-level fields map as follows:

| Current field | V2 concept |
|---|---|
| `effect_num` | `id` |
| `effect_type` | `type` |
| `effect_op` | `op` |
| `affects_opponent=true` | `side: "opponent"` |
| `extra_attack=true` | `damageKind: "extra"` |
| `benefit_on` | `damagePass` |
| `trigger_for` / `trigger_vs` | `targeting.trigger` |
| `benefit_for` / `benefit_vs` | `targeting.applies` |
| `effect_duration` | `duration` |
| `effect_values` | `valuePctByLevel` |
| `effect_is_chance` / `effect_probabilities` | `chancePctByLevel` |

## Former `special` Concepts

The current hero catalogue uses `special` for four separate ideas. V2 exposes
them explicitly:

| Current `special` shape | V2 concept |
|---|---|
| `{ "pause_attack": true }` | `triggerAction: "pause_triggering_attack"` |
| `{ "effect_evolution": { "category": "effect_is_total_damage" } }` | `valueSemantics: "total_damage_pct"` |
| `{ "effect_evolution": { "category": "effect_decrease" } }` | `valueEvolution` |
| `{ "role": "...", "stat": "..." }` on slot 4 | `widget.role` and `widget.stat` |

The runtime also checks `special.hp_threshold` and `special.onDefense`, and
`trigger_for=first` is recognized by `RoundEffect`. No current hero skill file
uses those concepts, so the proposal reserves them instead of inventing
unverified hero entries.

## Expressibility Check

The proposed vocabulary covers every current hero catalogue variant:

- activation cadence: passive, every N turns, every N attacks, first turn,
  last turn, skill-level chance, same-round stacking, and troop-alive gating
- effect trigger: all, once, troop-specific trigger; `first` reserved for the
  runtime-supported but currently unused case
- benefit target: trigger, all, friendly, troop-specific target
- target relation: any current target, locked target, specific troop type, and
  fan-out splash (`benefit_vs=all`)
- damage pass: all, normal-only, extra-only
- effect kind: ordinary modifier, extra damage, dodge
- side: self and opponent
- duration: battle, turns, attacks, lagged duration
- value behavior: level values, level probabilities, total-damage extra values,
  geometric value decay
- widget stat bonuses: attack, defense, health, lethality across attack,
  defense, and rally roles

Because the proposed JSON keeps `type`, `op`, `id`, and current level values,
future adapter work can verify round traces against the existing
Skill -> RoundEffect -> Benefit path without collapsing mechanics into
source-specific shortcuts.
