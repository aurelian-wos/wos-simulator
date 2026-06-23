# WOS-443 Targeted Bucket Membership Testcase Design

## Context

WOS-443 needs deterministic simulator-designed experiments for the named Edith, Gordon, and Bradley skills. The previous generic WOS-443 fixtures did not satisfy this issue and have been removed.

The method is to patch one target effect at a time into each candidate bucket and simulate a paired fight that includes deterministic reference buckets. The live emulator result should then land near one candidate row. Core physics are presumed correct; if no-hero controls fail, stop and debug stats/report parsing before interpreting bucket membership.

## Relevant files

- `scripts/wos443_bucket_membership_matrix.ts`
- `simulator/config/hero_definitions/Edith.json`
- `simulator/config/hero_definitions/Gordon.json`
- `simulator/config/hero_definitions/Bradley.json`
- `skill/data/player_hero_skills.json` or a fresh equivalent supplied with `WOS443_PLAYER_HERO_SKILLS`

## Knowledge files to read

Before running or interpreting this batch, read:

- `skill/KNOWLEDGE_INDEX.md`
- `skill/knowledge/skill-isolation-with-fixed-hero-kits.md`
- `skill/knowledge/skill-divergence-debugging.md`
- `skill/knowledge/effect-sensitivity-tracing.md`
- `skill/knowledge/testcase-dashboard-calibration.md`
- `skill/references/commands.md`

## Task

Before assigning Battle Runner, confirm which of the runnable probes below should be collected. For every selected probe, Battle Runner must first capture fresh hero skills for both accounts, then run an exact no-hero control with the same accounts, side roles, troop counts, tiers, fire-crystal levels, buffs, and report-capture path.

Generate the current simulator matrix with:

```bash
WOS443_PLAYER_HERO_SKILLS=skill/data/player_hero_skills.json npx --yes tsx scripts/wos443_bucket_membership_matrix.ts
```

Current captured levels used for the table below:

- minxxx: Edith 3/3/3, Gordon 2/2/0, Bradley 4/3/3
- WIP: Edith 1/0/0, Gordon 1/1/0, Bradley 4/4/4

## Expected outcomes

Outcome is signed remaining score: positive means attacker survivors, negative means defender survivors. A strong probe has a wide gap between all candidate rows.

| Target skill | Runnable now? | Troop shape | Candidate outcomes | Minimum gap | Use |
|---|---:|---|---|---:|---|
| Edith S1/1 marksman damage taken down (`StrategicBalance/1`) | yes | WIP attacks 4800 marksman; minxxx defends Edith+Sergey+Patrick with 700 marksman | `damageTaken.down` = -25; `defense.up` = +158; `health.up` = +297 | 139 | Battle Runner-ready after exact no-hero control |
| Edith S1/2 lancer damage dealt up (`StrategicBalance/2`) | yes | WIP attacks 9000 infantry; minxxx defends Edith+Patrick+Jasser with 1560 lancer | `damage.up` = +1619; `attack.up` = +1744; `lethality.up` = +1843 | 99 | Battle Runner-ready if troop availability supports counts |
| Edith S2 infantry damage taken down (`Ironclad/1`) | yes | WIP attacks 8000 infantry; minxxx defends Edith+Sergey+Patrick with 2400 infantry | `damageTaken.down` = -839; `defense.up` = -824; `health.up` = -812 | 12 | Marginal but usable only if report parsing is tight; prefer rerun/tune if availability differs |
| Gordon S1/1 lancer damage dealt up (`VenomInfusion/1`) | yes | minxxx attacks Gordon+Patrick+Jasser with 1000 lancer; WIP defends 6120 infantry | `damage.up` = +8; `attack.up` = -351; `lethality.up` = -776 | 359 | Battle Runner-ready only if WIP can field defender count; otherwise retune with fresh troop limits |
| Gordon S1/2 target damage dealt down (`VenomInfusion/2`) | yes | minxxx defends Gordon+Sergey+Lynn with 720 lancer; WIP attacks 5700 lancer | `damage.down` = +1740; `attack.down` = +1772; `lethality.down` = +1769 | 3 | Not acceptable as a bucket discriminator; do not assign without a better design |
| Gordon S2/1 lancer damage dealt up (`ChemicalTerror/1`) | yes | minxxx attacks Gordon+Patrick+Jasser with 1000 lancer; WIP defends 6120 infantry | `damage.up` = +7; `attack.up` = -352; `lethality.up` = -776 | 359 | Battle Runner-ready only if WIP can field defender count; otherwise retune with fresh troop limits |
| Gordon S2/2 all enemy damage dealt down (`ChemicalTerror/2`) | yes | WIP attacks 3420 each mixed; minxxx defends Gordon+Sergey+Lynn with 3200 lancer | `damage.down` = +2791; `attack.down` = +3013; `lethality.down` = +2854 | 63 | Battle Runner-ready if troop availability supports counts |
| Gordon S3/1 enemy infantry damage taken up (`ToxicRelease/1`) | no, captured S3=0 | simulator-only: minxxx attacks Gordon+Renee with 240 lancer; WIP defends 360 infantry | `damageTaken.up` = +232; `defense.down` = +232; `health.down` = +232 | 0 | Blocked: current accounts cannot check; also no live reference separates candidates |
| Gordon S3/2 enemy marksman damage dealt down (`ToxicRelease/2`) | no, captured S3=0 | simulator-only: WIP attacks 7560 marksman; minxxx defends Gordon+Sergey+Lynn with 980 lancer | `damage.down` = +1056; `attack.down` = +1104; `lethality.down` = +1110 | 6 | Blocked by locked S3 and weak separation |
| Bradley S2/1 damage to lancer up (`PowerShot/1`) | yes | minxxx attacks Bradley+Jasser with 1260 marksman; WIP defends 7560 lancer | `damage.up` = -775; `attack.up` = -1099; `lethality.up` = -1196 | 97 | Battle Runner-ready only if WIP can field defender count; otherwise retune with fresh troop limits |
| Bradley S2/2 damage to infantry up (`PowerShot/2`) | yes | minxxx attacks Bradley+Jasser with 900 marksman; WIP defends 5760 infantry | `damage.up` = +57; `attack.up` = -162; `lethality.up` = -300 | 138 | Battle Runner-ready only if WIP can field defender count; otherwise retune with fresh troop limits |
| Bradley S3 all troops damage up (`TacticalAssistance/1`) | yes | WIP attacks Bradley+Jasser with 2520 each mixed; minxxx defends 900 each mixed | `damage.up` = +1395; `attack.up` = +479; `lethality.up` = -93 | 572 | Battle Runner-ready if WIP can field attacker count |

## Non-goals

- Do not modify simulator damage formulas, bucket definitions, effect classifier policy, report parsing, OCR, template matching, gestures, or scroll behavior as part of this issue.
- Do not claim individual skill isolation from game data. These are full-current-kit fixtures.
- Do not write `sim_result` into testcase JSON. `run-testcase` collects observations only.
- Do not assign Gordon S3 probes until fresh captured skills show Gordon S3 is unlocked on an account.

## Acceptance criteria

- CEO/board confirms which Battle Runner-ready probes to run.
- Fresh hero skill capture exists for both instances before the batch.
- Each selected hero fixture has a same-session exact no-hero control.
- Live observed signed remaining score lands clearly closest to one candidate row and at least 20 troops away from the next candidate row.
- Any weak or unavailable probe is not assigned as if it proves bucket membership.
- Any confirmed divergence sent to Simulator Engineer includes hero, skill, candidate bucket rows, observed vs expected survivors, testcase path/control result, and a narrow hypothesis. Remind them core physics are correct.

## Validation commands

From the simulator repo root:

```bash
WOS443_PLAYER_HERO_SKILLS=skill/data/player_hero_skills.json npx --yes tsx scripts/wos443_bucket_membership_matrix.ts
```

## Risk notes

- Several strong probes require thousands of troops on one side. Battle Runner must verify troop availability before execution. If counts are unavailable, retune with the script using actual limits; do not shrink counts blindly and keep the old expected rows.
- Gordon S1/2 is currently too weak to prove bucket membership.
- Gordon S3 is blocked by captured skill level 0 on both minxxx and WIP.
- The simulator matrix uses captured skill levels from `skill/data/player_hero_skills.json`. Refresh this file before final assignment if account skills changed.

## Output expectations

Before assigning Battle Runner, request confirmation on this design. After confirmation, QA should commit captured testcase JSON under `testcases/emulator_verified/` and comment with:

- Commands run and repeat counts.
- Fresh hero skill capture confirmation.
- Control survivors, hero fixture survivors, and closest candidate row.
- Any blocker, including troop shortages or missing hero availability.
