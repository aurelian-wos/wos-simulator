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
"""Train a tiny ONNX classifier for fixed-crop hero names.

Input is one or more debug directories produced by:
  ./scripts/wosctl --instance minxxx capture-hero-skills --debug

The model sees the same white-text mask as the Tesseract path, so season badges
are removed before classification. It emits logits for the captured hero names.
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
MODEL_PATH = SKILL_DIR / "models" / "hero_name.onnx"
LABELS_PATH = SKILL_DIR / "models" / "hero_name_labels.json"

HERO_NAME_CROP = (185, 8, 360, 58)
THRESHOLD = 720


def _mask(crop: np.ndarray, threshold: int = THRESHOLD) -> np.ndarray:
    return np.where(crop.astype(np.uint16).sum(axis=2) > threshold, 0, 255).astype(np.uint8)


def _features(crop: np.ndarray) -> np.ndarray:
    return (_mask(crop).astype(np.float32).reshape(-1) / 255.0)


def _shift_image(crop: np.ndarray, dx: int, dy: int) -> np.ndarray:
    return cv2.warpAffine(
        crop,
        np.float32([[1, 0, dx], [0, 1, dy]]),
        (crop.shape[1], crop.shape[0]),
        borderMode=cv2.BORDER_REPLICATE,
    )


def _augment(crop: np.ndarray) -> list[np.ndarray]:
    variants = [crop]
    for dx in (-2, -1, 0, 1, 2):
        for dy in (-1, 0, 1):
            if dx or dy:
                variants.append(_shift_image(crop, dx, dy))
    for threshold in (690, 705, 735, 750):
        variants.append(_mask(crop, threshold))
    return variants


def load_samples(debug_dirs: list[Path]) -> tuple[np.ndarray, np.ndarray, list[str]]:
    labels: list[str] = []
    label_to_id: dict[str, int] = {}
    xs: list[np.ndarray] = []
    ys: list[int] = []

    for debug_dir in debug_dirs:
        for skills_path in sorted(debug_dir.glob("*_skills.json")):
            stem = skills_path.name.removesuffix("_skills.json")
            full_path = debug_dir / f"{stem}_full.png"
            if not full_path.exists():
                continue
            payload = json.loads(skills_path.read_text())
            hero = str(payload.get("hero", "")).strip()
            if not hero:
                continue
            image = cv2.imread(str(full_path))
            if image is None:
                continue
            if hero not in label_to_id:
                label_to_id[hero] = len(labels)
                labels.append(hero)
            x, y, w, h = HERO_NAME_CROP
            crop = image[y:y + h, x:x + w]
            if crop.size == 0:
                continue
            for variant in _augment(crop):
                if variant.ndim == 2:
                    xs.append(variant.astype(np.float32).reshape(-1) / 255.0)
                else:
                    xs.append(_features(variant))
                ys.append(label_to_id[hero])

    if not xs:
        raise SystemExit(f"No labeled hero-name crops found in {debug_dirs}")
    return np.vstack(xs).astype(np.float32), np.array(ys, dtype=np.int64), labels


def export_onnx(model: LogisticRegression, out_path: Path) -> None:
    weights = model.coef_.astype(np.float32).T
    bias = model.intercept_.astype(np.float32)
    graph = helper.make_graph(
        nodes=[helper.make_node("Gemm", ["features", "weights", "bias"], ["logits"])],
        name="HeroNameClassifier",
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
    parser.add_argument("--labels-out", type=Path, default=LABELS_PATH)
    args = parser.parse_args()

    x, y, labels = load_samples(args.debug_dirs)
    counts = {labels[idx]: int((y == idx).sum()) for idx in sorted(set(y))}
    print(f"samples={len(y)} augmented classes={len(labels)}")
    print(json.dumps(counts, indent=2))

    if len(labels) < 2:
        raise SystemExit("Need at least two hero classes to train")
    splitter = StratifiedShuffleSplit(n_splits=1, test_size=0.25, random_state=7)
    train_idx, test_idx = next(splitter.split(x, y))

    clf = LogisticRegression(max_iter=3000, C=10.0, random_state=7)
    clf.fit(x[train_idx], y[train_idx])
    pred = clf.predict(x[test_idx])
    truth = y[test_idx]
    print("confusion_matrix:")
    print(confusion_matrix(truth, pred, labels=list(range(len(labels)))))
    print(classification_report(truth, pred, target_names=labels, zero_division=0))

    clf.fit(x, y)
    export_onnx(clf, args.out)
    args.labels_out.parent.mkdir(parents=True, exist_ok=True)
    args.labels_out.write_text(json.dumps(labels, indent=2) + "\n")
    print(f"wrote {args.out}")
    print(f"wrote {args.labels_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
