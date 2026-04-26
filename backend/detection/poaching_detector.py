"""
Poaching detection using YOLO (Ultralytics).

Place the poaching model in backend/trained_models/ (e.g. PoachingDetection.pt).
Override via POACHING_MODEL_PATH env or pass to get_model/run_poaching_detection.

Usage (as in Colab): model.predict(source=image_path, conf=0.25, save=False)
"""

import io
import logging
import os
from pathlib import Path
from typing import Union

logger = logging.getLogger(__name__)

# Default path under backend/ (models in backend/trained_models/)
DEFAULT_MODEL_PATH = Path("trained_models/PoachingDetection.pt")

_poaching_model = None


def get_model(model_path: Union[str, Path, None] = None):
    """Load and cache the poaching YOLO model. Uses POACHING_MODEL_PATH env if model_path is None."""
    global _poaching_model
    if model_path is None:
        path = Path(os.environ.get("POACHING_MODEL_PATH", str(DEFAULT_MODEL_PATH)))
    else:
        path = Path(model_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Poaching model not found at {path.absolute()}. "
            "Place your model in backend/trained_models/ (e.g. PoachingDetection.pt) or set POACHING_MODEL_PATH."
        )
    if _poaching_model is None:
        from ultralytics import YOLO

        _poaching_model = YOLO(str(path))
        logger.info("Loaded poaching YOLO model from %s", path)
    return _poaching_model


def is_model_available(model_path: Union[str, Path, None] = None) -> bool:
    """Return True if the poaching model file exists."""
    if model_path is None:
        path = Path(os.environ.get("POACHING_MODEL_PATH", str(DEFAULT_MODEL_PATH)))
    else:
        path = Path(model_path)
    return path.exists()


def run_poaching_detection(
    image: Union[str, Path, bytes],
    confidence: float = 0.25,
    model_path: Union[str, Path, None] = None,
) -> tuple[list[str], float]:
    """
    Detect poaching-related objects in an image using YOLO.

    Args:
        image: Image as file path (str/Path), bytes, or PIL Image.
        confidence: Min confidence (0–1); detections below are dropped. Use 0.25 to match Colab; higher values (e.g. 0.75) will return fewer or no detections.
        model_path: Override path to .pt model.

    Returns:
        (detected_object_names: list[str], max_confidence_pct: float)
        If no detections, returns ([], 0.0).
    """
    model = get_model(model_path)

    source = image
    if isinstance(image, bytes):
        from PIL import Image

        source = Image.open(io.BytesIO(image)).convert("RGB")

    results = model.predict(source=source, conf=confidence, save=False, verbose=False)

    detected_names: list[str] = []
    max_conf_pct = 0.0

    if not results or len(results) == 0:
        return detected_names, max_conf_pct

    result = results[0]
    if result.boxes is None or len(result.boxes.xyxy) == 0:
        return detected_names, max_conf_pct

    conf = result.boxes.conf.cpu().numpy()
    cls_ids = result.boxes.cls.cpu().numpy().astype(int)

    seen: set[str] = set()
    for i in range(len(conf)):
        cls_id = int(cls_ids[i])
        name = result.names.get(cls_id, f"class_{cls_id}")
        if name not in seen:
            seen.add(name)
            detected_names.append(name)
        c = float(conf[i]) * 100.0
        if c > max_conf_pct:
            max_conf_pct = c

    return detected_names, round(max_conf_pct, 1)
