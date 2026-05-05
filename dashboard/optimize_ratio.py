"""Search troop compositions for the best win rate against a fixed opponent."""

from __future__ import annotations

import copy
import json
import math
import os
import statistics
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Any, Dict, Iterable, List, Sequence, Tuple

try:
    from .simulate_common import fight_once, prepare_simulation_environment
except ImportError:
    from simulate_common import fight_once, prepare_simulation_environment

MAX_COMPOSITIONS = 8000
MAX_SIMULATIONS = 200000
DEFAULT_REPLICATES = 20
DEFAULT_TOP_RESULTS = 10
DEFAULT_INFANTRY_MIN_PCT = 30.0
DEFAULT_INFANTRY_MAX_PCT = 70.0
DEFAULT_MAX_WORKERS = max(1, min(10, (os.cpu_count() or 2) - 1))
ADAPTIVE_PHASE1_REPLICATES = 30
ADAPTIVE_PHASE2_REPLICATES = 10
ADAPTIVE_FINAL_REPLICATES = 100
ADAPTIVE_MAX_PHASE2_SEEDS = 20
ADAPTIVE_LOCAL_NEIGHBOURS_PER_SEED = 49
ADAPTIVE_MAX_FINALISTS = 40

_WORKER_ATTACKER_CFG: Dict[str, Any] | None = None
_WORKER_DEFENDER_CFG: Dict[str, Any] | None = None
_WORKER_RALLY_MODE = False
_WORKER_REPLICATES = DEFAULT_REPLICATES
_WORKER_OPTIMIZE_SIDE = "attacker"


def _recommended_step(total: int) -> int:
    if total <= 0:
        return 1
    return max(1, int(round(total / 30)))


def _resolve_infantry_bounds(
    total: int,
    step: int,
    min_pct: float,
    max_pct: float,
) -> Tuple[int, int]:
    min_count = math.ceil((total * min_pct) / 100)
    max_count = math.floor((total * max_pct) / 100)
    start = math.ceil(min_count / step) * step
    end = math.floor(max_count / step) * step
    return start, end


def _composition_grid(
    total: int,
    step: int,
    infantry_min_pct: float,
    infantry_max_pct: float,
) -> Iterable[Tuple[int, int, int]]:
    start, end = _resolve_infantry_bounds(total, step, infantry_min_pct, infantry_max_pct)
    for infantry in range(start, end + 1, step):
        remaining = total - infantry
        for lancer in range(0, remaining + 1, step):
            marksman = total - infantry - lancer
            yield infantry, lancer, marksman


def _counts_for_percentages(total: int, infantry_pct: int, lancer_pct: int) -> Tuple[int, int, int]:
    marksman_pct = 100 - infantry_pct - lancer_pct
    raw = [
        (total * infantry_pct) / 100,
        (total * lancer_pct) / 100,
        (total * marksman_pct) / 100,
    ]
    counts = [int(math.floor(value)) for value in raw]
    remainder = total - sum(counts)
    order = sorted(
        range(3),
        key=lambda idx: (raw[idx] - counts[idx], -idx),
        reverse=True,
    )
    for idx in order[:remainder]:
        counts[idx] += 1
    return counts[0], counts[1], counts[2]


def _percentage_grid(
    total: int,
    pct_step: int,
    infantry_min_pct: float,
    infantry_max_pct: float,
) -> Iterable[Tuple[int, int, int]]:
    min_inf = int(math.ceil(infantry_min_pct / pct_step) * pct_step)
    max_inf = int(math.floor(infantry_max_pct / pct_step) * pct_step)
    seen: set[Tuple[int, int, int]] = set()
    for infantry_pct in range(min_inf, max_inf + 1, pct_step):
        for lancer_pct in range(0, 100 - infantry_pct + 1, pct_step):
            counts = _counts_for_percentages(total, infantry_pct, lancer_pct)
            if counts in seen:
                continue
            seen.add(counts)
            yield counts


def _ratio_pct(composition: Tuple[int, int, int], total: int) -> Tuple[int, int, int]:
    if total <= 0:
        return (0, 0, 0)
    infantry, lancer, marksman = composition
    inf_pct = round((infantry / total) * 100)
    lanc_pct = round((lancer / total) * 100)
    mark_pct = 100 - inf_pct - lanc_pct
    return inf_pct, lanc_pct, mark_pct


def _adaptive_neighbours(
    seeds: Sequence[Dict[str, Any]],
    total: int,
    infantry_min_pct: float,
    infantry_max_pct: float,
) -> List[Tuple[int, int, int]]:
    candidates: set[Tuple[int, int, int]] = set()
    for row in seeds:
        inf_pct, lanc_pct, _mark_pct = _ratio_pct(
            (row["infantry_count"], row["lancer_count"], row["marksman_count"]),
            total,
        )
        for inf_delta in range(-3, 4):
            next_inf = inf_pct + inf_delta
            if next_inf < math.ceil(infantry_min_pct) or next_inf > math.floor(infantry_max_pct):
                continue
            for lanc_delta in range(-3, 4):
                next_lanc = lanc_pct + lanc_delta
                next_mark = 100 - next_inf - next_lanc
                if next_lanc < 0 or next_mark < 0:
                    continue
                candidates.add(_counts_for_percentages(total, next_inf, next_lanc))
    return sorted(candidates)


def _estimated_adaptive_compositions(phase1_count: int) -> int:
    return (
        phase1_count
        + ADAPTIVE_MAX_PHASE2_SEEDS * ADAPTIVE_LOCAL_NEIGHBOURS_PER_SEED
        + ADAPTIVE_MAX_FINALISTS
    )


def _composition_count(
    total: int,
    step: int,
    infantry_min_pct: float,
    infantry_max_pct: float,
) -> int:
    start, end = _resolve_infantry_bounds(total, step, infantry_min_pct, infantry_max_pct)
    if start > end:
        return 0
    count = 0
    for infantry in range(start, end + 1, step):
        remaining = total - infantry
        count += remaining // step + 1
    return count


def _normalise_step(total: int, raw_step: Any) -> int:
    try:
        step = int(raw_step or 0)
    except (TypeError, ValueError):
        step = 0
    if step <= 0:
        step = _recommended_step(total)
    return max(1, step)


def _normalise_replicates(raw_value: Any) -> int:
    try:
        replicates = int(raw_value or DEFAULT_REPLICATES)
    except (TypeError, ValueError):
        replicates = DEFAULT_REPLICATES
    return max(1, min(500, replicates))


def _normalise_pct(raw_value: Any, default_value: float) -> float:
    try:
        value = float(raw_value if raw_value is not None else default_value)
    except (TypeError, ValueError):
        value = default_value
    return max(0.0, min(100.0, value))


def _worker_init(
    attacker_cfg: Dict[str, Any],
    defender_cfg: Dict[str, Any],
    rally_mode: bool,
    replicates: int,
    optimize_side: str,
) -> None:
    global _WORKER_ATTACKER_CFG, _WORKER_DEFENDER_CFG, _WORKER_RALLY_MODE, _WORKER_REPLICATES, _WORKER_OPTIMIZE_SIDE
    _WORKER_ATTACKER_CFG = attacker_cfg
    _WORKER_DEFENDER_CFG = defender_cfg
    _WORKER_RALLY_MODE = rally_mode
    _WORKER_REPLICATES = replicates
    _WORKER_OPTIMIZE_SIDE = optimize_side
    prepare_simulation_environment()


def _evaluate_composition(composition: Tuple[int, int, int]) -> Dict[str, Any]:
    if _WORKER_ATTACKER_CFG is None or _WORKER_DEFENDER_CFG is None:
        raise RuntimeError("Optimizer worker not initialized")

    infantry, lancer, marksman = composition
    attacker_cfg = copy.deepcopy(_WORKER_ATTACKER_CFG)
    defender_cfg = copy.deepcopy(_WORKER_DEFENDER_CFG)
    optimized_cfg = attacker_cfg if _WORKER_OPTIMIZE_SIDE == "attacker" else defender_cfg
    optimized_cfg["troops"] = {
        **(optimized_cfg.get("troops", {}) or {}),
        "infantry": infantry,
        "lancer": lancer,
        "marksman": marksman,
    }

    outcomes = []
    optimized_wins = 0
    total_attacker_left = 0
    total_defender_left = 0

    for _ in range(_WORKER_REPLICATES):
        battle = fight_once(attacker_cfg, defender_cfg, _WORKER_RALLY_MODE)
        outcome = int(battle["outcome"])
        attacker_remaining = int(battle["attacker_remaining"])
        defender_remaining = int(battle["defender_remaining"])
        optimized_margin = outcome if _WORKER_OPTIMIZE_SIDE == "attacker" else -outcome
        outcomes.append(optimized_margin)
        total_attacker_left += attacker_remaining
        total_defender_left += defender_remaining
        if _WORKER_OPTIMIZE_SIDE == "attacker":
            if attacker_remaining > defender_remaining:
                optimized_wins += 1
        elif defender_remaining > attacker_remaining:
            optimized_wins += 1

    mean_outcome = statistics.fmean(outcomes) if outcomes else 0.0
    margin_std = statistics.stdev(outcomes) if len(outcomes) > 1 else 0.0
    win_rate = optimized_wins / _WORKER_REPLICATES if _WORKER_REPLICATES else 0.0
    # Wilson lower bound keeps low-repeat lucky candidates from crowding out
    # stable finalists during the adaptive narrowing phases.
    z = 1.96
    n = max(1, _WORKER_REPLICATES)
    denominator = 1 + (z * z) / n
    centre = win_rate + (z * z) / (2 * n)
    spread = z * math.sqrt((win_rate * (1 - win_rate) + (z * z) / (4 * n)) / n)
    conservative_win_rate = (centre - spread) / denominator
    conservative_margin = mean_outcome - z * (margin_std / math.sqrt(n))
    total = max(1, infantry + lancer + marksman)
    return {
        "infantry_count": infantry,
        "lancer_count": lancer,
        "marksman_count": marksman,
        "infantry_pct": (infantry / total) * 100,
        "lancer_pct": (lancer / total) * 100,
        "marksman_pct": (marksman / total) * 100,
        "win_rate": win_rate,
        "win_rate_pct": win_rate * 100,
        "avg_margin": mean_outcome,
        "margin_std": margin_std,
        "conservative_win_rate": conservative_win_rate,
        "conservative_win_rate_pct": conservative_win_rate * 100,
        "conservative_margin": conservative_margin,
        "avg_attacker_left": total_attacker_left / _WORKER_REPLICATES if _WORKER_REPLICATES else 0.0,
        "avg_defender_left": total_defender_left / _WORKER_REPLICATES if _WORKER_REPLICATES else 0.0,
    }


def _result_key(row: Dict[str, Any]) -> Tuple[int, int, int]:
    return row["infantry_count"], row["lancer_count"], row["marksman_count"]


def _rank_results(results: Sequence[Dict[str, Any]], margin_key: str = "avg_margin") -> List[Dict[str, Any]]:
    return sorted(
        results,
        key=lambda row: (
            row["win_rate"],
            row[margin_key],
            row["avg_attacker_left"] if _WORKER_OPTIMIZE_SIDE == "attacker" else row["avg_defender_left"],
            -row["avg_defender_left"] if _WORKER_OPTIMIZE_SIDE == "attacker" else -row["avg_attacker_left"],
        ),
        reverse=True,
    )


def _dedupe_results(results: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_key: dict[Tuple[int, int, int], Dict[str, Any]] = {}
    for row in results:
        by_key.setdefault(_result_key(row), row)
    return list(by_key.values())


def _tag_results(
    results: Iterable[Dict[str, Any]],
    search_phase: str,
    phase_replicates: int,
) -> List[Dict[str, Any]]:
    tagged = []
    for row in results:
        entry = dict(row)
        entry["search_phase"] = search_phase
        entry["phase_replicates"] = phase_replicates
        tagged.append(entry)
    return tagged


def _evaluate_batch(
    compositions: Sequence[Tuple[int, int, int]],
    attacker_cfg: Dict[str, Any],
    defender_cfg: Dict[str, Any],
    rally_mode: bool,
    replicates: int,
    optimize_side: str,
    max_workers: int,
    progress_start: int = 0,
    progress_total: int | None = None,
) -> List[Dict[str, Any]]:
    total_progress = progress_total or len(compositions)
    if max_workers <= 1 or len(compositions) <= 1:
        _worker_init(attacker_cfg, defender_cfg, rally_mode, replicates, optimize_side)
        results = []
        for index, comp in enumerate(compositions, start=1):
            results.append(_evaluate_composition(comp))
            print(json.dumps({"type": "progress", "done": progress_start + index, "total": total_progress}), file=sys.stderr, flush=True)
        return results

    results = []
    completed = 0
    with ProcessPoolExecutor(
        max_workers=min(max_workers, len(compositions)),
        initializer=_worker_init,
        initargs=(attacker_cfg, defender_cfg, rally_mode, replicates, optimize_side),
    ) as executor:
        futures = [executor.submit(_evaluate_composition, comp) for comp in compositions]
        for future in as_completed(futures):
            results.append(future.result())
            completed += 1
            print(json.dumps({"type": "progress", "done": progress_start + completed, "total": total_progress}), file=sys.stderr, flush=True)
    return results


def main() -> int:
    global _WORKER_OPTIMIZE_SIDE

    raw = sys.stdin.read()
    try:
        config = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON: {exc}", file=sys.stderr)
        return 2

    attacker_cfg = config.get("attacker", {}) or {}
    defender_cfg = config.get("defender", {}) or {}
    rally_mode = bool(config.get("rally_mode", False))
    optimize_side = str(config.get("optimize_side") or "attacker").lower()
    if optimize_side not in {"attacker", "defender"}:
        print("optimize_side must be attacker or defender.", file=sys.stderr)
        return 2
    _WORKER_OPTIMIZE_SIDE = optimize_side
    search_mode = str(config.get("search_mode") or "adaptive").lower()
    if search_mode not in {"adaptive", "grid"}:
        print("search_mode must be adaptive or grid.", file=sys.stderr)
        return 2
    optimized_cfg = attacker_cfg if optimize_side == "attacker" else defender_cfg

    total = sum(
        int((optimized_cfg.get("troops", {}) or {}).get(cat, 0) or 0)
        for cat in ("infantry", "lancer", "marksman")
    )
    if total <= 0:
        print(f"{optimize_side.title()} must have at least one troop to optimize a ratio.", file=sys.stderr)
        return 2

    step = _normalise_step(total, config.get("grid_step"))
    replicates = _normalise_replicates(config.get("search_replicates"))
    infantry_min_pct = _normalise_pct(
        config.get("infantry_min_pct"),
        DEFAULT_INFANTRY_MIN_PCT,
    )
    infantry_max_pct = _normalise_pct(
        config.get("infantry_max_pct"),
        DEFAULT_INFANTRY_MAX_PCT,
    )
    if infantry_min_pct > infantry_max_pct:
        print("Infantry max % must be greater than or equal to infantry min %.", file=sys.stderr)
        return 2
    top_n = max(1, min(25, int(config.get("top_n", DEFAULT_TOP_RESULTS) or DEFAULT_TOP_RESULTS)))
    max_workers = max(1, min(DEFAULT_MAX_WORKERS, int(config.get("jobs", DEFAULT_MAX_WORKERS) or DEFAULT_MAX_WORKERS)))

    prepare_simulation_environment()

    if search_mode == "grid":
        compositions = list(
            _composition_grid(
                total,
                step,
                infantry_min_pct,
                infantry_max_pct,
            )
        )
        composition_count = len(compositions)
        if composition_count == 0:
            print(
                "No compositions fit inside the requested infantry range at this grid step.",
                file=sys.stderr,
            )
            return 2
        projected_battles = composition_count * replicates
        if composition_count > MAX_COMPOSITIONS:
            print(
                f"Grid too fine: {composition_count} compositions exceeds the limit of {MAX_COMPOSITIONS}. "
                "Increase the grid step.",
                file=sys.stderr,
            )
            return 2
        if projected_battles > MAX_SIMULATIONS:
            print(
                f"Search too expensive: {projected_battles} projected battles exceeds the limit of {MAX_SIMULATIONS}. "
                "Increase the grid step or lower search replicates.",
                file=sys.stderr,
            )
            return 2
        results = _evaluate_batch(
            compositions,
            attacker_cfg,
            defender_cfg,
            rally_mode,
            replicates,
            optimize_side,
            max_workers,
        )
        all_points = _tag_results(results, "grid", replicates)
        final_replicates = replicates
        phase_counts = {"grid": composition_count}
    else:
        phase1_compositions = list(
            _percentage_grid(total, 5, infantry_min_pct, infantry_max_pct)
        )
        if not phase1_compositions:
            print("No valid 5% grid ratios fit inside the requested infantry range.", file=sys.stderr)
            return 2
        phase1_results = _evaluate_batch(
            phase1_compositions,
            attacker_cfg,
            defender_cfg,
            rally_mode,
            ADAPTIVE_PHASE1_REPLICATES,
            optimize_side,
            max_workers,
            progress_total=_estimated_adaptive_compositions(len(phase1_compositions)),
        )
        phase1_points = _tag_results(
            phase1_results,
            "coarse",
            ADAPTIVE_PHASE1_REPLICATES,
        )
        top_by_win = _rank_results(phase1_results)[:10]
        top_by_margin = sorted(phase1_results, key=lambda row: row["avg_margin"], reverse=True)[:10]
        phase2_candidates = _adaptive_neighbours(
            _dedupe_results([*top_by_win, *top_by_margin]),
            total,
            infantry_min_pct,
            infantry_max_pct,
        )
        phase2_results = _evaluate_batch(
            phase2_candidates,
            attacker_cfg,
            defender_cfg,
            rally_mode,
            ADAPTIVE_PHASE2_REPLICATES,
            optimize_side,
            max_workers,
            progress_start=len(phase1_compositions),
            progress_total=_estimated_adaptive_compositions(len(phase1_compositions)),
        )
        phase2_points = _tag_results(
            phase2_results,
            "local",
            ADAPTIVE_PHASE2_REPLICATES,
        )
        top_by_conservative_win = sorted(
            phase2_results,
            key=lambda row: (row["conservative_win_rate"], row["conservative_margin"]),
            reverse=True,
        )[:20]
        top_by_conservative_margin = sorted(
            phase2_results,
            key=lambda row: (row["conservative_margin"], row["conservative_win_rate"]),
            reverse=True,
        )[:20]
        finalists = [_result_key(row) for row in _dedupe_results([*top_by_conservative_win, *top_by_conservative_margin])]
        results = _evaluate_batch(
            finalists,
            attacker_cfg,
            defender_cfg,
            rally_mode,
            ADAPTIVE_FINAL_REPLICATES,
            optimize_side,
            max_workers,
            progress_start=len(phase1_compositions) + len(phase2_candidates),
            progress_total=len(phase1_compositions) + len(phase2_candidates) + len(finalists),
        )
        finalist_points = _tag_results(
            results,
            "finalist",
            ADAPTIVE_FINAL_REPLICATES,
        )
        all_points = [*phase1_points, *phase2_points, *finalist_points]
        final_replicates = ADAPTIVE_FINAL_REPLICATES
        composition_count = len(phase1_compositions) + len(phase2_candidates) + len(finalists)
        projected_battles = (
            len(phase1_compositions) * ADAPTIVE_PHASE1_REPLICATES
            + len(phase2_candidates) * ADAPTIVE_PHASE2_REPLICATES
            + len(finalists) * ADAPTIVE_FINAL_REPLICATES
        )
        phase_counts = {
            "phase1": len(phase1_compositions),
            "phase2": len(phase2_candidates),
            "finalists": len(finalists),
        }

    results = _rank_results(results)

    best = dict(results[0])
    best["rank"] = 1
    best["is_best"] = True

    top_results = []
    for index, row in enumerate(results[:top_n], start=1):
        entry = dict(row)
        entry["rank"] = index
        entry["is_best"] = index == 1
        top_results.append(entry)

    points = []
    for row in all_points:
        point = dict(row)
        point["is_best"] = (
            row["infantry_count"] == best["infantry_count"]
            and row["lancer_count"] == best["lancer_count"]
            and row["marksman_count"] == best["marksman_count"]
            and row.get("search_phase") in {"finalist", "grid"}
        )
        points.append(point)

    json.dump(
        {
            "total_troops": total,
            "optimized_side": optimize_side,
            "search_mode": search_mode,
            "grid_step": step,
            "compositions_tested": composition_count,
            "projected_battles": projected_battles,
            "replicates_per_ratio": final_replicates,
            "infantry_min_pct": infantry_min_pct,
            "infantry_max_pct": infantry_max_pct,
            "phase_counts": phase_counts,
            "best": best,
            "top_results": top_results,
            "points": points,
        },
        sys.stdout,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Optimize ratio error: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc(file=sys.stderr)
        raise
