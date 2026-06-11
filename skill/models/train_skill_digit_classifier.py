#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "numpy==2.4.2",
#   "opencv-python-headless==4.13.0.92",
#   "onnx==1.20.0",
#   "scikit-learn==1.8.0",
# ]
# ///
"""Train a tiny ONNX classifier for hero skill level digit crops.

Input is a debug directory produced by:
  ./scripts/wosctl --instance minxxx capture-hero-skills --debug

The model expects flattened 19x18 white-text masks and emits five logits for
classes 1..5. Runtime falls back to Tesseract if the model is missing or unsure.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from onnx import TensorProto, helper, numpy_helper
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedShuffleSplit

SKILL_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = SKILL_DIR / "models" / "hero_skill_digit.onnx"

SLOT_DIGIT_CROPS = {
    "slot_1": (598, 308, 19, 18),
    "slot_2": (647, 466, 19, 18),
    "slot_3": (598, 637, 19, 18),
}
THRESHOLD = 650


def _mask(crop: np.ndarray) -> np.ndarray:
    return np.where(crop.astype(np.uint16).sum(axis=2) > THRESHOLD, 0, 255).astype(np.uint8)


def _features(crop: np.ndarray) -> np.ndarray:
    return (_mask(crop).astype(np.float32).reshape(-1) / 255.0)


def _slot_labels(skills: dict[str, int]) -> dict[str, int]:
    labels = {"slot_1": int(skills["skill_1"])}
    if "skill_3" in skills:
        labels["slot_2"] = int(skills["skill_2"])
        labels["slot_3"] = int(skills["skill_3"])
    else:
        labels["slot_3"] = int(skills["skill_2"])
    return {slot: level for slot, level in labels.items() if 1 <= level <= 5}


def _shift_image(crop: np.ndarray, dx: int, dy: int) -> np.ndarray:
    border = cv2.BORDER_REPLICATE
    return cv2.warpAffine(crop, np.float32([[1, 0, dx], [0, 1, dy]]), (crop.shape[1], crop.shape[0]), borderMode=border)


def _augment(crop: np.ndarray) -> list[np.ndarray]:
    variants = [crop]
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx or dy:
                variants.append(_shift_image(crop, dx, dy))
    for threshold in (625, 675):
        variants.append(np.where(crop.astype(np.uint16).sum(axis=2) > threshold, 0, 255).astype(np.uint8))
    return variants


def load_samples(debug_dirs: list[Path]) -> tuple[np.ndarray, np.ndarray]:
    xs: list[np.ndarray] = []
    ys: list[int] = []
    for debug_dir in debug_dirs:
        for skills_path in sorted(debug_dir.glob("*_skills.json")):
            stem = skills_path.name.removesuffix("_skills.json")
            full_path = debug_dir / f"{stem}_full.png"
            if not full_path.exists():
                continue
            payload = json.loads(skills_path.read_text())
            labels = _slot_labels(payload["skills"])
            image = cv2.imread(str(full_path))
            if image is None:
                continue
            for slot, level in labels.items():
                x, y, w, h = SLOT_DIGIT_CROPS[slot]
                crop = image[y:y + h, x:x + w]
                if crop.size == 0:
                    continue
                for variant in _augment(crop):
                    if variant.ndim == 2:
                        xs.append((variant.astype(np.float32).reshape(-1) / 255.0))
                    else:
                        xs.append(_features(variant))
                    ys.append(level)
    if not xs:
        raise SystemExit(f"No labeled skill digit crops found in {debug_dirs}")
    return np.vstack(xs).astype(np.float32), np.array(ys, dtype=np.int64)


def export_onnx(model: LogisticRegression, out_path: Path) -> None:
    # ONNX Gemm uses Y = alpha * A * B + beta * C. LogisticRegression stores
    # coef_ as [classes, features], so transpose for [features, classes].
    weights = model.coef_.astype(np.float32).T
    bias = model.intercept_.astype(np.float32)
    graph = helper.make_graph(
        nodes=[
            helper.make_node("Gemm", ["features", "weights", "bias"], ["logits"]),
        ],
        name="HeroSkillDigitClassifier",
        inputs=[helper.make_tensor_value_info("features", TensorProto.FLOAT, [None, weights.shape[0]])],
        outputs=[helper.make_tensor_value_info("logits", TensorProto.FLOAT, [None, weights.shape[1]])],
        initializer=[
            numpy_helper.from_array(weights, "weights"),
            numpy_helper.from_array(bias, "bias"),
        ],
    )
    model_proto = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model_proto.ir_version = 10
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(model_proto.SerializeToString())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("debug_dirs", type=Path, nargs="+")
    parser.add_argument("--out", type=Path, default=MODEL_PATH)
    args = parser.parse_args()

    x, y = load_samples(args.debug_dirs)
    counts = {int(level): int((y == level).sum()) for level in sorted(set(y))}
    print(f"samples={len(y)} augmented class_counts={counts}")

    if len(set(y)) < 2:
        raise SystemExit("Need at least two classes to train")
    min_count = min((y == level).sum() for level in set(y))
    if min_count >= 2:
        splitter = StratifiedShuffleSplit(n_splits=1, test_size=0.25, random_state=7)
        train_idx, test_idx = next(splitter.split(x, y))
    else:
        train_idx = test_idx = np.arange(len(y))

    clf = LogisticRegression(max_iter=2000, C=10.0, random_state=7)
    clf.fit(x[train_idx], y[train_idx] - 1)
    pred = clf.predict(x[test_idx]) + 1
    truth = y[test_idx]
    print("confusion_matrix labels 1..5:")
    print(confusion_matrix(truth, pred, labels=[1, 2, 3, 4, 5]))
    print(classification_report(truth, pred, labels=[1, 2, 3, 4, 5], zero_division=0))

    # Refit all samples before export.
    clf.fit(x, y - 1)
    export_onnx(clf, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
