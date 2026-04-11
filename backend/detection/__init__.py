"""
Wildlife detection package.

Usage:
    from detection import run_detection, get_model, is_model_available
    from detection.schemas import Detection, Location, WildlifeDetectionResult
"""

import os
from pathlib import Path

from detection.schemas import Detection, Location, WildlifeDetectionResult
from detection.yolo_detector import get_model, is_model_available, run_detection

# Model path from env (default: trained_models/WildlifeDetection.pt under backend/)
def get_model_path() -> Path:
    return Path(os.environ.get("WILDLIFE_MODEL_PATH", "trained_models/WildlifeDetection.pt"))

__all__ = [
    "run_detection",
    "get_model",
    "get_model_path",
    "is_model_available",
    "Detection",
    "Location",
    "WildlifeDetectionResult",
]
