# Whiteout Survival Battle Simulator - Change Log

## ✅ Completed Fixes & Improvements

### Core Mechanics Fixes

- **`benefit_vs` Semantics Cleanup** - Disambiguated the overloaded `benefit_vs: "all"` keyword. Previously `"all"` was doing double duty: in pass 2 (extra attacks) it meant "fan out splash to every surviving enemy type", but in pass 1 (normal attacks) it was quietly being used as "globally active buff" — two different jobs under the same name. Introduced a new `benefit_vs: "any"` value for the "globally active, non-splash" case, reserved `"all"` exclusively for fan-out splash (which requires `extra_attack: true`), and added a load-time check in `Effect.__init__` that rejects `benefit_vs: "all"` without `extra_attack: true` with a helpful message suggesting `any` or `target` instead. Migrated 52 existing hero/troop effects from `all` to `any` accordingly. Fixes a subtle target-freezing bug that surfaced in jessie_solo_nc #8 (both sides running Jessie) where `benefit_vs: "target"` on a permanent skill locked the DamageUp benefit to the round-0 primary target rather than applying globally.
- **OppDamageDown Calculation** - Fixed debuff calculation that was incorrectly multiplying by 0.8 instead of dividing by 1.2 (for 20% debuff)
- **Mean Calculation** - Switched from geometric mean to arithmetic mean, which improved accuracy to <1% error (would need further investigation for perfect accuracy)
- **Empty Troop Types** - Fixed crash when one troop type has zero units
- **OppDefenseDown Formula** - Corrected denominator calculation from `1-x` to `1+x`, resolving division by zero errors

### Regression Testing

- **WOS-160 (2026-04-19)** — `lynn_solo` entry `_1` (balanced 1500/1500/1500 attacker) split into its own test_id `lynn_solo_balanced` and accept-residualled via `KNOWN_ISSUE_WAIVERS` in `check_testcases.py` (expected bias +0.93% ±0.5%). Root cause is a widget-state data gap: Lynn's S4 "Silent Threat" widget was fitted during the minxxx captures but the testcase JSON schema has no widget slot, so the sim under-predicts defender survival for that entry. Adding `skill_4: 3` to the entry collapses the bias to -0.02% (confirmed experimentally), while the non-balanced entry `_0` (kept as `lynn_solo`) was captured without the widget. The proper fix (extend the skill capture pipeline to record per-battle widget state) is tracked as a follow-up ticket.

### Hero & Skill System Fixes

- **Multiple Same Joiners** - Fixed issue where duplicate joiners were stored in a dictionary by name, causing only one to be effective
- **Mia Stacking** - Fixed division by zero error and incorrect stacking behavior when joining with multiple Mias
- **Greg Skill Level 5** - Corrected value from 80% to 40% in skill data sheet
- **Alonso Skill 2** - Fixed trigger conditions in sheet (was marksmen-only, should be all troops) and benefit application
- **Duration Type Validation** - Extended condition check from `['turn', 'round']` to `['turn', 'round', 'turns', 'rounds']` to prevent skills from staying active entire fight (was an issue with Greg S1)

### Game Rework - Stun Removal & skills update

Updated codebase and skill sheets to reflect removal of stun mechanics and the new skill update:
- Alonso Skill 1
- Jeronimo Skill 3
- Natalia Skill 1
- Molly Skill 1
- Philly Skill 3
- Flint Skill 1
- Logan Skill 1
- Hector Skill 2

### Code Quality Improvements

- Fixed reference vs copy issues
- Added division by zero protection
- Fixed mutable default arguments
- Improved `__repr__` implementations
- Added input validation
- Added class constants for magic numbers
- Optimized repeated dictionary lookups
- Cached redundant list comprehensions
- Fixed typos in error messages
- Added docstrings 

**See [CODE_REVIEW_ISSUES.md](CODE_REVIEW_ISSUES.md) for detailed code quality improvements**

---

## 🔧 Known Issues & Future Work

### Pending Fixes

- **Skill Refresh Mechanism** - Greg Skill 1 (and possibly others): skill activation can refresh duration but the effect doesn't stack additively

### General work

- **More testing** - Keep testing different skills/scenarios/etc... to find errors or improvements.

- **Adding new heroes** - Currently : up to gen 5

---

## 🚀 Future Enhancements

### Statistical Analysis & Visualization
- Generate plots showing troop losses/injuries over time
- Being able to run 100+ battles for statistical analysis (average, standard deviation,...)
- Can then be used to compare simulation results with in-game reports to calculate event probabilities and help with testing to improve simulation accuracy

### Other Ideas
- Explore machine learning approaches (GANs, gradient descent) for optimizing stats/ratios with fixed hero compositions
- Implement widget & pet system:
  - Set widget/pet levels
  - Calculate effective stats with widgets, pets, and buffs active

---

*Last Updated: January 2026*

