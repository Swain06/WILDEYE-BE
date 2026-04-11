"""
Wildlife detection using YOLO (Ultralytics).

Improved logic:
1. Runs COCO (yolov8n.pt) for robust common species (Elephant, etc.)
2. Runs OIV7 (yolov8n-oiv7.pt) for detailed species (Tiger, Leopard, etc.)
3. Runs Custom Model if WILDLIFE_MODEL_PATH is set.
4. Filters out generic "Animal" labels.
5. Deduplicates detections across models.
"""

import io
import logging
import os
import uuid
import numpy as np
from pathlib import Path
from typing import Union

from detection.schemas import Detection, Location, WildlifeDetectionResult

logger = logging.getLogger(__name__)

# Models
COCO_MODEL = "yolov8n.pt"
OIV7_MODEL = "yolov8n-oiv7.pt"

# COCO Animal Classes (0-indexed)
COCO_ANIMAL_IDS = {14, 15, 16, 17, 18, 19, 20, 21, 22, 23}

# OIV7 Animal Classes - Removed ID 7 ("Animal") for specificity
OIV7_ANIMAL_IDS = frozenset({
    5, 8, 9, 11, 28, 33, 69, 71, 81, 84, 96, 100, 106, 108, 142, 152, 160, 163,
    176, 179, 184, 192, 206, 209, 215, 219, 221, 225, 235, 239, 246, 251, 255, 282,
    288, 307, 313, 315, 316, 319, 340, 343, 347, 358, 359, 361, 362, 366, 379, 387,
    398, 402, 411, 412, 418, 422, 443, 444, 446, 451, 452, 470, 471, 482, 488, 508,
    534, 544, 561, 562, 581, 597, 599,
})

DEFAULT_CONF = 0.25
DEFAULT_IMGSZ = 640

_models_cache = {}

def get_yolo_model(name_or_path: str):
    if name_or_path not in _models_cache:
        from ultralytics import YOLO
        _models_cache[name_or_path] = YOLO(name_or_path)
    return _models_cache[name_or_path]

def iou(boxA, boxB):
    # box = (x1, y1, x2, y2)
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA + 1) * max(0, yB - yA + 1)
    boxAArea = (boxA[2] - boxA[0] + 1) * (boxA[3] - boxA[1] + 1)
    boxBArea = (boxB[2] - boxB[0] + 1) * (boxB[3] - boxB[1] + 1)
    return interArea / float(boxAArea + boxBArea - interArea)

def run_detection(
    image: Union[str, Path, bytes],
    location: Location,
    model_path: Union[str, Path, None] = None,
    confidence_threshold: float = DEFAULT_CONF,
    imgsz: int = DEFAULT_IMGSZ,
) -> WildlifeDetectionResult:
    from datetime import datetime, timezone
    from PIL import Image

    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    
    source = image
    if isinstance(image, bytes):
        source = Image.open(io.BytesIO(image)).convert("RGB")

    raw_candidates = []

    # 1. Run COCO (Best for fundamental animals)
    coco = get_yolo_model(COCO_MODEL)
    res_coco = coco.predict(source=source, conf=confidence_threshold, imgsz=imgsz, verbose=False)[0]
    if res_coco.boxes is not None:
        for i, cid in enumerate(res_coco.boxes.cls.cpu().numpy().astype(int)):
            if cid in COCO_ANIMAL_IDS:
                raw_candidates.append({
                    "species": res_coco.names.get(cid, "Animal").capitalize(),
                    "conf": float(res_coco.boxes.conf[i]),
                    "bbox": tuple(map(float, res_coco.boxes.xyxy[i])),
                    "priority": 2 # COCO is very robust
                })

    # 2. Run OIV7 (Detailed species: Tiger, Leopard, Elephant, etc.)
    oiv7 = get_yolo_model(OIV7_MODEL)
    res_oiv7 = oiv7.predict(source=source, conf=confidence_threshold, imgsz=imgsz, verbose=False)[0]
    if res_oiv7.boxes is not None:
        for i, cid in enumerate(res_oiv7.boxes.cls.cpu().numpy().astype(int)):
            name = res_oiv7.names.get(cid, "").lower()
            if cid in OIV7_ANIMAL_IDS and name not in ["animal", "animals"]:
                raw_candidates.append({
                    "species": name.capitalize(),
                    "conf": float(res_oiv7.boxes.conf[i]),
                    "bbox": tuple(map(float, res_oiv7.boxes.xyxy[i])),
                    "priority": 3 # OIV7 is very specific
                })

    # 3. Run Custom Model (if any)
    custom_path = model_path or os.environ.get("WILDLIFE_MODEL_PATH")
    if custom_path and Path(custom_path).exists():
        custom = get_yolo_model(custom_path)
        res_custom = custom.predict(source=source, conf=confidence_threshold, imgsz=imgsz, verbose=False)[0]
        if res_custom.boxes is not None:
            for i, cid in enumerate(res_custom.boxes.cls.cpu().numpy().astype(int)):
                name = res_custom.names.get(cid, "").lower()
                if name not in ["animal", "animals"]:
                    raw_candidates.append({
                        "species": name.capitalize(),
                        "conf": float(res_custom.boxes.conf[i]),
                        "bbox": tuple(map(float, res_custom.boxes.xyxy[i])),
                        "priority": 1 # Custom might be niche
                    })

    # Deduplicate and prioritize
    # Sort by priority (higher first) then confidence
    raw_candidates.sort(key=lambda x: (x["priority"], x["conf"]), reverse=True)
    
    final_detections = []
    for cand in raw_candidates:
        # Check for overlap with already accepted detections
        is_duplicate = False
        for existing in final_detections:
            if iou(cand["bbox"], existing.bbox) > 0.5:
                is_duplicate = True
                break
        
        if not is_duplicate:
            final_detections.append(Detection(
                id=str(uuid.uuid4()),
                species=cand["species"],
                confidence=round(cand["conf"] * 100.0, 1),
                bbox=cand["bbox"],
                timestamp=now_iso,
                location=location
            ))

    return WildlifeDetectionResult(
        detections=final_detections,
        timestamp=now_iso,
        location=location,
    )

def get_model(model_path=None):
    return get_yolo_model(model_path or COCO_MODEL)

def is_model_available(model_path=None):
    return True
