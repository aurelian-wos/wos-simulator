import math

from check_testcases import (
    compute_testcase_stats,
    initial_army_error_scale,
    measure_distance,
    measure_signed_outcome_error_ratio,
)


def test_error_scale_uses_total_initial_troops():
    assert initial_army_error_scale(300, 999) == 1299
    assert initial_army_error_scale(0, 0) == 1


def test_signed_outcome_error_is_total_initial_army_normalized():
    sim_result = {"attacker": 46, "defender": 0}
    game_result = {"attacker": 10.63, "defender": 0}
    error_scale = initial_army_error_scale(300, 999)

    assert measure_signed_outcome_error_ratio(
        sim_result,
        game_result,
        error_scale,
        ignore_one_diff=False,
    ) == 2.72


def test_absolute_error_is_total_initial_army_normalized():
    sim_result = {"attacker": 0, "defender": 466}
    game_result = {"attacker": 0, "defender": 513.67}
    error_scale = initial_army_error_scale(300, 999)

    diff, diff_pct = measure_distance(
        sim_result,
        game_result,
        error_scale,
        ignore_one_diff=False,
    )

    assert diff == 47.7
    assert diff_pct == 3.67


def test_aggregate_bias_uses_same_total_initial_army_denominator():
    stats = compute_testcase_stats(
        sim_outcomes=[46, 44, 7, 42, 42],
        game_outcomes=[10.63],
        attacker_init=300,
        defender_init=999,
    )

    assert stats["bias_raw"] == 25.57
    assert math.isclose(stats["bias_pct"], 1.97)
