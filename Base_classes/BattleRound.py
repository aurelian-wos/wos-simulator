import json
import math
from Base_classes.Fighter import Fighter
from Base_classes.UnitType import UnitType, _to_unitx, prettify
from Base_classes.Skill import Skill, Effect, RoundEffect, Benefit

class BattleRound():
    """Represents a single round of battle between two fighters.
    
    Handles calculation of troops remaining, skill activation, damage bonuses,
    and casualties for one round of combat.
    
    Attributes:
        DEBUG (bool): Enable debug output for battle calculations.
        DEBUG_FREQ (int): Frequency of debug output (every N rounds).
        DEBUG_MAX_ROUND (int): Maximum round to output debug information.
    """
    DEBUG = False
    DEBUG_FREQ = 10
    DEBUG_MAX_ROUND = 10
    
    def __init__(self, fighter: Fighter, opponent: Fighter, round_idx, army_min) -> None:
        """Initialize a battle round.
        
        Args:
            fighter: The attacking fighter for this round.
            opponent: The defending fighter for this round.
            round_idx: The current round index (0-based).
            army_min: Minimum army size between both fighters.
        """
        # Init
        self.fighter = fighter
        self.opponent = opponent
        self.round_idx = round_idx
        self.army_min = army_min

        # prepare
        self.round_troops = {}
        self.targets = {}

        # effects
        self.round_effects = []
        self.order_effects = []
        self.dodge_effects = []
        # benefits
        self.round_benefits = []

        # results
        self.round_kills = {}
        self.round_dmg_coef = {ut:0 for ut in UnitType}
        self.paused_units = set()
        # self.need_continue_skills = {}  # Not used for now

        # Calc Round troops
        self.calc_round_troops()


    def get_results(self):
        """Calculate and store battle results for this round.
        
        Computes casualties inflicted by this fighter on the opponent.
        """
        self.calc_round_kills()
        
    def calc_round_troops(self):
        """Calculate remaining troops for this round.
        
        For round 0, copies initial troop counts. For subsequent rounds,
        calculates remaining troops after casualties from previous round.
        """
        if self.round_idx == 0 :
            self.round_troops = self.fighter.troops_by_type.copy()
        else :
            for ut in UnitType:
                self.round_troops[ut] = max(0, self.fighter.rounds[self.round_idx - 1].round_troops[ut] - sum(vs[ut] if ut in vs else 0 for vs in self.opponent.rounds[self.round_idx -1].round_kills.values()) )
    
    def calc_skills(self):
        """Calculate and apply all skill effects for this round.
        
        Determines which skills activate and identifies attack targets.
        """
        self.calc_round_effects()
        self.calc_targets()

    def calc_round_effects(self):
        """Activate all skill effects that meet their conditions this round.
        
        Checks each effect's skill and effect conditions, adding active
        effects to appropriate lists (order, dodge, or standard effects).
        """
        for effect in self.fighter.effects:
            if effect._skill.r_skill_condition(self.fighter, self.round_idx):
                if effect.r_effect_condition(self.fighter, self.opponent, self.round_idx):
                    self.add_round_effect(effect)

        if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
            def format_effects(effects):
                return ', '.join(f"{r._effect._skill.skill_name}:{r._effect.name}" for r in effects) or '-'

            print(f"\nROUND {self.round_idx} EFFECTS ({self.fighter.name})")
            print(f"      order : {format_effects(self.order_effects)}")
            print(f"      dodge : {format_effects(self.dodge_effects)}")
            print(f"      other : {format_effects(self.round_effects)}")
    
    def add_round_effect(self, effect: Effect):
        """Add an activated effect to the appropriate list for this round.
        
        Args:
            effect: The effect to add.
            
        Effects are categorized by type:
        - attack_order: Added to order_effects
        - dodge: Added to dodge_effects  
        - others: Added to round_effects
        """
        effect.activations_count += 1
        if 'attack_order' in effect.type.lower():
            self.order_effects.append(RoundEffect(effect, self.round_idx))
        elif 'dodge' in effect.type.lower():
            self.dodge_effects.append(RoundEffect(effect, self.round_idx))
        else:
            self.round_effects.append(RoundEffect(effect, self.round_idx))
    
    def calc_targets(self):
        """Determine attack targets for each unit type.
        
        Calculates which enemy unit type each of this fighter's unit types
        will attack, considering attack order effects.
        """
        for ut, num in self.round_troops.items():
            if not num: continue
            self.targets[ut] = self.get_unit_target(ut)

        if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
            print(f"\nROUND {self.round_idx} TARGETS ({self.fighter.name})")
            print('      ' + ', '.join(f"{ut.name}->{self.targets.get(ut).name if self.targets.get(ut) else 'None'}" for ut in UnitType if self.round_troops[ut]))

    def get_unit_target(self, ut: UnitType):
        """Get the target unit type for a given attacking unit type.
        
        Args:
            ut: The attacking unit type.
            
        Returns:
            UnitType: The enemy unit type to target, or None if no valid target.
            
        Lancers may have modified attack order from skills.
        """
        attack_order = UnitType.list()
        if ut == UnitType.lanc:                 # For simplification: lancers only. To update later if needed
            if self.order_effects:
                if self.order_effects[-1].trigger_condition(self.fighter, self.opponent, ut, UnitType.inf, self.round_idx):
                    attack_order = [_to_unitx(_t) for _t in self.order_effects[-1]._effect.value.split('/')]
                    self.order_effects[-1]._effect.trigger_count += 1
                    self.order_effects[-1]._effect.uses_count += 1
        for vs in attack_order:
            if self.opponent.rounds[self.round_idx].round_troops[vs] > 0 : return vs
        
    def calc_benefits(self):
        """Calculate all active benefits from skills for this round.
        
        Processes offensive and defensive effects, creating benefit objects
        that will modify damage calculations. Carries over multi-turn benefits
        from previous rounds.
        """
        defense_effects = []
        for r_effect in self.round_effects:
            r_effect : RoundEffect
            if ('onDefense' in r_effect._effect.special) and r_effect._effect.special['onDefense'] :
                defense_effects.append(r_effect)
                continue
            for ut in UnitType:
                if not self.round_troops[ut]: continue
                target = self.targets.get(ut)
                if target is None: continue
                if r_effect.trigger_condition(self.fighter, self.opponent, ut, target, self.round_idx):
                    benefit = r_effect.activate_effect(self.fighter, ut, target)
                    self.round_benefits.append(benefit)
                    if r_effect._effect.special.get('pause_attack'):
                        self.paused_units.add(ut)

        for r_effect in defense_effects:
            r_effect : RoundEffect
            for vs in UnitType:
                if not self.opponent.rounds[self.round_idx].round_troops[vs]: continue
                victim = self.opponent.rounds[self.round_idx].targets[vs]
                if r_effect.trigger_condition(self.fighter, self.opponent, victim, vs, self.round_idx):
                    benefit = r_effect.activate_effect(self.fighter, victim, vs)
                    # print(f"___ (R{self.round_idx}-{self.fighter.name}) DEBUG: r_effect onDefense: {r_effect.r_eff_id} ACTIVATED for my {victim.name} vs {vs.name}, defense_effects = {defense_effects}")
                    self.round_benefits.append(benefit)
        
        if self.round_idx > 0:
            for benefit in self.fighter.rounds[self.round_idx - 1].round_benefits:
                benefit: Benefit
                if benefit.is_valid("any", "any", self.round_idx):
                    self.round_benefits.append(benefit)
        
        if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
            print(f'\nBENEFITS ---> R{self.round_idx} - {self.fighter.name} ')
            for benefit in self.round_benefits:
                print(f"        - {benefit}")
    
    def calc_dodging_benefits(self, ut, target):
        """Check and apply opponent's dodge effects.
        
        Args:
            ut: The attacking unit type.
            target: The target unit type being attacked.
            
        If opponent has active dodge effects that trigger, adds dodge
        benefits to opponent's round benefits.
        """
        opp_dodge_effects = self.opponent.rounds[self.round_idx].dodge_effects
        if opp_dodge_effects:
            for r_effect in opp_dodge_effects:
                r_effect: RoundEffect
                if r_effect.trigger_condition(self.fighter, self.opponent, target, ut, self.round_idx):
                    self.opponent.rounds[self.round_idx].round_benefits.append(r_effect.activate_effect(self.fighter, target, ut))

    def calc_round_kills(self):
        """Calculate casualties inflicted by this fighter this round.

        Two-pass damage model:
          Pass 1 (normal): base_dmg * effective * normal_coef against primary target
          Pass 2 (extra):  base_dmg * effective * extra_bonus * extra_mult against each enemy type
        """
        if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
            print(f"\n🔹🔹🔹🔹🔹🔹🔹🔹  R{self.round_idx} : BONUS CALCS - {self.fighter.name}")

        # PASS 1: Normal damage against primary target
        for ut in UnitType:
            army = self.calc_round_army(ut)
            if army == 0:
                continue

            target = self.targets[ut]

            if ut in self.paused_units:
                self.fighter.cumul_attacks[ut] += 1
                self.opponent.cumul_received_attacks[target] += 1
                continue

            self.calc_dodging_benefits(ut, target)

            unit_base_dmg = army * self.fighter.attack_by_type[ut] / self.opponent.defense_by_type[target] / 100
            ut_kills = self.calc_bonus_dmg(unit_base_dmg, ut, target)

            if ut_kills > 0:
                self.round_kills[ut] = {target: ut_kills}

        # PASS 2: Extra (skill) damage against every surviving enemy type.
        # This pass iterates (ut -> extra_vs) across all enemy unit types and is the
        # only place fan-out splash happens. A benefit only reaches this pass if it
        # has extra_attack=True; its benefit_vs setting controls the fan-out shape:
        #   benefit_vs="all"    -> hits every surviving enemy type (splash)
        #   benefit_vs="target" -> hits the primary target only
        #   benefit_vs=<unit>   -> hits that type only
        # `benefit_vs="any"` is only meaningful in PASS 1 (global buffs on normal
        # attacks) and is rejected at load time on extra_attack effects.
        attack_keys = ['DamageUp', 'OppDefenseDown']
        defense_keys = ['DefenseUp', 'OppDamageDown']

        for ut in UnitType:
            army = self.calc_round_army(ut)
            if army == 0: continue
            primary_target = self.targets.get(ut)
            if primary_target is None: continue

            for extra_vs in UnitType:
                if self.opponent.rounds[self.round_idx].round_troops[extra_vs] <= 0: continue

                # Collect benefits into three buckets
                extra_att = {k: {} for k in attack_keys}       # extra_attack=True (the actual extra attacks)
                extra_mult_att = {k: {} for k in attack_keys}  # benefit_on="extra" (multipliers like Wu Ming S3)
                effective_att = {k: {} for k in attack_keys}   # benefit_on="all" (general buffs)
                matched_extra = []

                for benefit in self.round_benefits:
                    if benefit.benefit_type not in attack_keys: continue
                    if not benefit.is_valid(ut, extra_vs, self.round_idx): continue

                    ben_value = float(benefit.correct_value(self.round_idx))

                    if benefit.extra_attack:
                        effect_dict = extra_att[benefit.benefit_type]
                        if benefit.op not in effect_dict: effect_dict[benefit.op] = 0
                        effect_dict[benefit.op] += ben_value
                        matched_extra.append((benefit, ben_value))
                    elif benefit.benefit_on == 'extra':
                        effect_dict = extra_mult_att[benefit.benefit_type]
                        if benefit.op not in effect_dict: effect_dict[benefit.op] = 0
                        effect_dict[benefit.op] += ben_value
                    elif benefit.benefit_on == 'all':
                        effect_dict = effective_att[benefit.benefit_type]
                        if benefit.op not in effect_dict: effect_dict[benefit.op] = 0
                        effect_dict[benefit.op] += ben_value

                if not matched_extra: continue

                # Check dodge covering extra attacks
                dodge_extra = False
                for opp_benefit in self.opponent.rounds[self.round_idx].round_benefits:
                    if 'dodge' not in opp_benefit.benefit_type.lower(): continue
                    if not opp_benefit.is_valid(extra_vs, ut, self.round_idx): continue
                    if opp_benefit.benefit_on in ('all', 'extra'):
                        dodge_extra = True
                        break

                if dodge_extra: continue

                # Collect opponent defensive benefits for extra pass
                effective_def = {k: {} for k in defense_keys}
                extra_mult_def = {k: {} for k in defense_keys}

                for opp_benefit in self.opponent.rounds[self.round_idx].round_benefits:
                    if 'dodge' in opp_benefit.benefit_type.lower(): continue
                    if opp_benefit.benefit_type not in defense_keys: continue
                    if opp_benefit.extra_attack: continue
                    if opp_benefit.benefit_on == 'normal': continue
                    if not opp_benefit.is_valid(extra_vs, ut, self.round_idx): continue

                    opp_value = float(opp_benefit.correct_value(self.round_idx))

                    if opp_benefit.benefit_on == 'extra':
                        effect_dict = extra_mult_def[opp_benefit.benefit_type]
                        if opp_benefit.op not in effect_dict: effect_dict[opp_benefit.op] = 0
                        effect_dict[opp_benefit.op] += opp_value
                    elif opp_benefit.benefit_on == 'all':
                        effect_dict = effective_def[opp_benefit.benefit_type]
                        if opp_benefit.op not in effect_dict: effect_dict[opp_benefit.op] = 0
                        effect_dict[opp_benefit.op] += opp_value

                unit_base_dmg = army * self.fighter.attack_by_type[ut] / self.opponent.defense_by_type[extra_vs] / 100

                effective = self.calc_coef(effective_att, effective_def)
                extra_coef = self.calc_coef(extra_att, {k: {} for k in defense_keys})
                extra_mult = self.calc_coef(extra_mult_att, extra_mult_def)
                extra_kills = unit_base_dmg * effective * (extra_coef - 1.0) * extra_mult

                if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
                    print(f"           🔷 EXTRA: {ut.name}->{extra_vs.name}  effective:{effective:.3f} extra_coef:{extra_coef:.3f} extra_mult:{extra_mult:.3f} -> kills:{extra_kills:.1f}")

                if extra_kills > 0:
                    for benefit, ben_value in matched_extra:
                        benefit._effect.extra_kills += unit_base_dmg * ben_value / 100
                        if not benefit.used:
                            benefit.use()
                            self.fighter.cumul_attacks[ut] += 1
                            self.opponent.cumul_received_attacks[extra_vs] += 1

                    if ut in self.round_kills:
                        self.round_kills[ut][extra_vs] = self.round_kills[ut].get(extra_vs, 0) + extra_kills
                    else:
                        self.round_kills[ut] = {extra_vs: extra_kills}

        if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
            if self.round_kills:
                print(f"\nROUND {self.round_idx} KILLS ({self.fighter.name})")
                for ut, targets in self.round_kills.items():
                    print('      ' + ', '.join(f"{ut.name}->{vs.name}:{kills:.1f}" for vs, kills in targets.items()))
            else:
                print(f"\nROUND {self.round_idx} KILLS ({self.fighter.name}): none")

    def calc_bonus_dmg(self, unit_base_dmg, ut: UnitType, vs: UnitType):
        """Pass 1: Calculate normal attack damage with general and normal-only buffs.

        Computes: base_dmg * effective * normal_coef
        Where effective = general buffs (benefit_on: "all") and
        normal_coef = normal-only buffs (benefit_on: "normal").
        Extra attack benefits and benefit_on: "extra" are handled in pass 2.

        Args:
            unit_base_dmg: Base damage before bonuses.
            ut: Attacking unit type.
            vs: Defending unit type (primary target).

        Returns:
            float: Normal attack damage after buffs and dodge.
        """
        if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
            print(f'\n🔸🔸🔸   {ut.name} / {vs.name}     ({self.fighter.name})')

        attack_effects_keys = ['DamageUp', 'OppDefenseDown']
        defense_effects_keys = ['DefenseUp', 'OppDamageDown']

        # Effective = general benefits (benefit_on: "all")
        effective_attacker = {key: {} for key in attack_effects_keys}
        effective_defender = {key: {} for key in defense_effects_keys}
        # Normal-only = benefits with benefit_on: "normal"
        normal_attacker = {key: {} for key in attack_effects_keys}
        normal_defender = {key: {} for key in defense_effects_keys}

        applied_skill_effects = {}

        # Fighter benefits (attacker's offensive buffs)
        for benefit in self.round_benefits:
            benefit: Benefit
            if benefit.extra_attack: continue
            if benefit.benefit_on == 'extra': continue
            if benefit.benefit_type not in attack_effects_keys: continue
            if not benefit.is_valid(ut, vs, self.round_idx): continue

            ben_type = benefit.benefit_type
            ben_op = benefit.op
            ben_value = float(benefit.correct_value(self.round_idx))

            if benefit.benefit_on == 'normal':
                effect_dict = normal_attacker[ben_type]
                if ben_op not in effect_dict: effect_dict[ben_op] = 0
                effect_dict[ben_op] += ben_value
            else:
                # benefit_on == 'all': general buffs go into effective
                skill_name = benefit._effect._skill.skill_name
                effect_key = (skill_name, ben_type, ben_op)
                effect_dict = effective_attacker[ben_type]

                if ben_op not in effect_dict:
                    effect_dict[ben_op] = 0

                if benefit._effect.is_chance and effect_key in applied_skill_effects:
                    applied_skill_effects[effect_key] = max(applied_skill_effects[effect_key], ben_value)
                    effect_dict[ben_op] = applied_skill_effects[effect_key]
                elif benefit._effect.is_chance:
                    applied_skill_effects[effect_key] = ben_value
                    effect_dict[ben_op] = max(effect_dict[ben_op], ben_value)
                else:
                    effect_dict[ben_op] += ben_value

            benefit.use()
            if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
                print(f"           APPLIED: ", benefit)

        # Opponent benefits (defender's defensive buffs)
        dodge_normal = False
        for opp_benefit in self.opponent.rounds[self.round_idx].round_benefits:
            opp_benefit: Benefit
            if not opp_benefit.is_valid(vs, ut, self.round_idx): continue
            opp_ben_type = opp_benefit.benefit_type

            if 'dodge' in opp_ben_type.lower():
                if opp_benefit.benefit_on in ('all', 'normal'):
                    dodge_normal = True
                opp_benefit.use()
                if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
                    print(f"           OPP_DODGE: ", opp_benefit)
                continue

            if opp_benefit.extra_attack: continue
            if opp_benefit.benefit_on == 'extra': continue
            if opp_ben_type not in defense_effects_keys: continue

            opp_ben_op = opp_benefit.op
            opp_ben_value = float(opp_benefit.correct_value(self.round_idx))

            if opp_benefit.benefit_on == 'normal':
                opp_effect_dict = normal_defender[opp_ben_type]
                if opp_ben_op not in opp_effect_dict:
                    opp_effect_dict[opp_ben_op] = 0
                opp_effect_dict[opp_ben_op] += opp_ben_value
            else:
                opp_skill_name = opp_benefit._effect._skill.skill_name
                opp_effect_key = (opp_skill_name, opp_ben_type, opp_ben_op)
                opp_effect_dict = effective_defender[opp_ben_type]

                if opp_ben_op not in opp_effect_dict:
                    opp_effect_dict[opp_ben_op] = 0

                if opp_benefit._effect.is_chance and opp_effect_key in applied_skill_effects:
                    applied_skill_effects[opp_effect_key] = max(applied_skill_effects[opp_effect_key], opp_ben_value)
                    opp_effect_dict[opp_ben_op] = applied_skill_effects[opp_effect_key]
                elif opp_benefit._effect.is_chance:
                    applied_skill_effects[opp_effect_key] = opp_ben_value
                    opp_effect_dict[opp_ben_op] = max(opp_effect_dict[opp_ben_op], opp_ben_value)
                else:
                    opp_effect_dict[opp_ben_op] += opp_ben_value

            opp_benefit.use()
            if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
                print(f"           OPP_APPLIED: ", opp_benefit)

        effective = self.calc_coef(effective_attacker, effective_defender)
        normal_coef = self.calc_coef(normal_attacker, normal_defender)

        if dodge_normal:
            coef = 0
        else:
            coef = effective * normal_coef

        self.round_dmg_coef[ut] = coef
        self.fighter.cumul_attacks[ut] += 1
        self.opponent.cumul_received_attacks[vs] += 1

        if BattleRound.DEBUG and self.round_idx % BattleRound.DEBUG_FREQ == 0 and self.round_idx < self.DEBUG_MAX_ROUND:
            print(f"\n           🔶 NORMAL_COEF: R{self.round_idx} - {self.fighter.name} - {ut.name} / {vs.name} :    effective:{effective:.3f} - normal:{normal_coef:.3f}  ---> 🔶 coef: {coef:.3f}")

        return unit_base_dmg * coef
    
    def calc_coef(self, attacker_dict, defender_dict):
        """Calculate damage coefficient from offensive and defensive effects.
        
        Args:
            attacker_dict: Dictionary of attacker's offensive effects by type and op.
            defender_dict: Dictionary of defender's defensive effects by type and op.
            
        Returns:
            float: Damage multiplier coefficient.
            
        Formula: (damageUp * oppDefenseDown) / (defenseUp * oppDamageDown)
        """
        damageUp = math.prod((1.0 + val / 100.0) for val in attacker_dict.get('DamageUp', {}).values())
        oppDefenseDown = math.prod((1.0 + val / 100.0) for val in attacker_dict.get('OppDefenseDown', {}).values())
        
        # Defender's defensive effects (reduce damage taken)
        defenseUp = math.prod((1.0 + val / 100.0) for val in defender_dict.get('DefenseUp', {}).values())
        oppDamageDown = math.prod((1.0 + val / 100.0) for val in defender_dict.get('OppDamageDown', {}).values())

        # DEBUG
        if BattleRound.DEBUG:
            pass
            # if self.round_idx % 5 == 0:
            #     print(f'------------------------------------- R{self.round_idx} - {self.fighter}')
            #     print('dmg_up:',damageUp)
            #     print('opp_dfs_down:',oppDefenseDown)
            #     print('dfs_up:', defenseUp)
            #     print('opp_dmg_down:', oppDamageDown)
    

        # if(damageUp != 1.0 or oppDefenseDown != 1.0 or defenseUp != 1.0 or oppDamageDown != 1.0):
        #     print('dmg_up:',damageUp)
        #     print('opp_dfs_down:',oppDefenseDown)
        #     print('dfs_up:', defenseUp)
        #     print('opp_dmg_down:', oppDamageDown)

        # Coefficient = (offensive buffs) / (defensive buffs)
        numerator = damageUp * oppDefenseDown
        denominator = defenseUp * oppDamageDown
        
        if denominator == 0 or denominator < 1e-10:
            print("⚠️  Warning: denominator too small, setting to large value to avoid division by zero.")
            coef = numerator * 1e10
        else:
            coef = numerator / denominator
        
        # if(coef != 1.0):
        #     print(coef)
        return coef


    def calc_round_army(self, ut: UnitType):
        """Calculate effective army size for a unit type.
        
        Args:
            ut: The unit type.
            
        Returns:
            int: Effective army size (square root formula).
            
        Uses game formula: sqrt(remaining_troops) * sqrt(min_army)
        """
        if ut not in self.round_troops: return 0
        army = (self.round_troops[ut] ** 0.5) * (self.army_min ** 0.5)

        ##### OR 
        # # army = (self.round_troops[ut] * self.army_min) ** 0.5
        ##### MORE LOGICAL WITH PYTHON FLOATS, BUT IT HAS BEEEN PROVEN LOGIC AND WOS ARE NOT FRIENDS

        army = math.ceil(army)
        return army
            
    def total_troops(self):
        """Calculate total remaining troops across all unit types.
        
        Returns:
            int: Sum of all remaining troops.
        """
        return sum(self.round_troops[ut] for ut in UnitType)
    
    def print_round_troops(self):
        """Format remaining troops for display.
        
        Returns:
            str: Formatted string showing troops by type.
        """
        return ' / '.join("{:6.0f}".format(round(self.round_troops[v],1)) for v in UnitType) 
    
    def print_round_coef(self):
        """Format damage coefficients for display.
        
        Returns:
            str: Formatted string showing coefficients by type.
        """
        return ' / '.join("{:6.2f}".format(round(self.round_dmg_coef[v],1)) for v in UnitType)
    
