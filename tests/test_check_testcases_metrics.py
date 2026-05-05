import math

from check_testcases import (
    compute_testcase_stats,
    initial_army_error_scale,
    measure_distance,
    measure_signed_outcome_error_ratio,
    summarize_non_t_stat_label,
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


def test_single_game_observation_stochastic_stats_are_low_evidence():
    stats = compute_testcase_stats(
        sim_outcomes=[1606, 1612, 1607, 1607, 1613],
        game_outcomes=[1597],
        attacker_init=1700,
        defender_init=300,
    )

    assert stats["stat_type"] == "single_obs"
    assert stats["stat"] is None
    assert stats["p"] is None
    assert stats["n_game"] == 1


def test_single_observation_stat_formats_as_low_evidence():
    assert summarize_non_t_stat_label([{"stat_type": "single_obs"}]) == "n=1"


def test_non_t_recap_label_distinguishes_p_only_files():
    assert summarize_non_t_stat_label([{"stat_type": "p"}]) == "p"


def test_non_t_recap_label_keeps_deterministic_shorthand():
    assert summarize_non_t_stat_label([{"stat_type": "deterministic"}]) == "det"


def test_non_t_recap_label_distinguishes_zero_var_files():
    assert summarize_non_t_stat_label([{"stat_type": "zero_var"}]) == "zvar"


def test_non_t_recap_label_marks_mixed_non_t_files():
    stats = [{"stat_type": "p"}, {"stat_type": "deterministic"}]

    assert summarize_non_t_stat_label(stats) == "non-t"
