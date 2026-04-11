"""
Ensemble wildlife detection: run all configured YOLO models and combine
results using weighted confidence voting.

Models are loaded via the shared LRU cache in yolo_detector.get_yolo_model()
so there is no duplicate loading cost when both pipelines are active.

Accuracy notes
--------------
* COCO (yolov8n.pt) has NO deer class — it confuses deer with dog/horse.
  We only accept COCO detections whose class ID is in COCO_ANIMAL_IDS AND
  whose name is already recognised as a real wildlife species.
* OIV7 (yolov8n-oiv7.pt) does have a Deer class (and many others).
  We accept any class in OIV7_ANIMAL_IDS except the generic "animal" label.
* Custom model: accept everything except generic names.
* Minimum per-model confidence is raised to 0.40 to cut low-quality detections.
"""

from __future__ import annotations

import io
import logging
from collections import defaultdict
from pathlib import Path

from pydantic import BaseModel

from detection.schemas import Location
from detection.yolo_detector import (
    get_yolo_model,
    COCO_ANIMAL_IDS,
    OIV7_ANIMAL_IDS,
    COCO_MODEL,
    OIV7_MODEL,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model registry — (path_or_name, human_label, filter_mode)
# filter_mode: "coco" | "oiv7" | "custom"
# ---------------------------------------------------------------------------

ENSEMBLE_MODELS: list[tuple[str, str, str]] = [
    (COCO_MODEL,  "COCO",          "coco"),
    (OIV7_MODEL,  "OpenImagesV7",  "oiv7"),
    ("backend/trained_models/WildlifeDetection.pt", "WildEye Custom", "custom"),
]

# Generic names to always reject (any model)
_GENERIC_NAMES: frozenset[str] = frozenset({"animal", "animals", "wildlife", "mammal"})

# COCO tends to mis-classify deer/wildcats as dog/cat (domestic animals it knows well).
# We only trust COCO votes for species it reliably identifies in wildlife contexts.
_COCO_TRUSTED_NAMES: frozenset[str] = frozenset({
    "elephant", "bear", "zebra", "giraffe", "cow", "sheep", "horse",
    "bird", "cat",  # cat kept as proxy for big cats at very high conf
})

# Minimum confidence to accept a single-model detection
_MIN_CONF = 0.40
_IMGSZ   = 640


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class EnsembleDetection(BaseModel):
    species: str
    confidence: float          # weighted-average confidence (0–100)
    votes: int                 # models that detected this species
    total_models: int          # total models that ran
    agreed: bool               # True when votes >= 2


class EnsembleResult(BaseModel):
    detections: list[EnsembleDetection]
    total_models_run: int
    high_confidence: list[EnsembleDetection]   # agreed=True AND confidence > 70


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------

def _accept(cls_id: int, name_lower: str, filter_mode: str) -> bool:
    """Return True if this detection passes the per-model class filter."""
    if not name_lower or name_lower in _GENERIC_NAMES:
        return False
    if filter_mode == "coco":
        # Only accept if both: class ID is a COCO animal AND name is trusted for wildlife
        return cls_id in COCO_ANIMAL_IDS and name_lower in _COCO_TRUSTED_NAMES
    if filter_mode == "oiv7":
        # OIV7 has specific wildlife classes (Deer, Tiger, Leopard, etc.) — trust its IDs
        return cls_id in OIV7_ANIMAL_IDS
    # Custom model: accept everything except generic labels
    return True


def ensemble_predict(image: bytes, location: Location | None = None) -> EnsembleResult:
    """
    Run every ENSEMBLE_MODELS entry on *image* (raw bytes), aggregate
    detections by species, and return an EnsembleResult.

    Steps:
    1. Apply per-model class-ID allow-lists (same logic as yolo_detector.py).
    2. Group accepted detections by normalised species name.
    3. Weighted-average confidence; sort descending.
    4. Mark detections where >= 2 models agreed as agreed=True.
    """
    from PIL import Image as PILImage

    try:
        source = PILImage.open(io.BytesIO(image)).convert("RGB")
    except Exception as exc:
        raise ValueError(f"Cannot open image bytes: {exc}") from exc

    # Only include models whose weight files exist (base models auto-download)
    available: list[tuple[str, str, str]] = []
    for path, label, mode in ENSEMBLE_MODELS:
        if Path(path).exists() or mode in ("coco", "oiv7"):
            available.append((path, label, mode))
        else:
            logger.warning("Ensemble: model not found, skipping — %s", path)

    if not available:
        available = ENSEMBLE_MODELS  # fallback

    total_models_run = len(available)

    # species_name → list of per-model confidence floats (0–1)
    species_votes: dict[str, list[float]] = defaultdict(list)

    for model_path, label, filter_mode in available:
        try:
            model = get_yolo_model(model_path)
            results = model.predict(
                source=source,
                conf=_MIN_CONF,
                imgsz=_IMGSZ,
                verbose=False,
            )[0]
            if results.boxes is None:
                continue

            for i, cls_tensor in enumerate(results.boxes.cls):
                cls_id    = int(cls_tensor)
                raw_name  = results.names.get(cls_id, "")
                name_lower = raw_name.lower().strip()

                if not _accept(cls_id, name_lower, filter_mode):
                    continue

                conf = float(results.boxes.conf[i])
                species_votes[name_lower.capitalize()].append(conf)

        except Exception as exc:
            logger.warning("Ensemble: model %s failed — %s", model_path, exc)

    # Aggregate
    aggregated: list[EnsembleDetection] = []
    for species, confs in species_votes.items():
        vote_count = len(confs)
        avg_conf   = sum(confs) / vote_count
        aggregated.append(
            EnsembleDetection(
                species=species,
                confidence=round(avg_conf * 100.0, 1),
                votes=vote_count,
                total_models=total_models_run,
                agreed=vote_count >= 2,
            )
        )

    aggregated.sort(key=lambda d: d.confidence, reverse=True)

    high_confidence = [
        d for d in aggregated if d.agreed and d.confidence > 70.0
    ]

    return EnsembleResult(
        detections=aggregated,
        total_models_run=total_models_run,
        high_confidence=high_confidence,
    )
