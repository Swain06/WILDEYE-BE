import time
import io
from typing import Annotated
from fastapi import APIRouter, File, UploadFile, HTTPException
from PIL import Image
from pathlib import Path

from detection.yolo_detector import get_yolo_model

router = APIRouter(prefix="/api/models", tags=["Models"])

MODELS_TO_BENCHMARK = [
    {"id": "yolov8n.pt", "label": "YOLOv8 Nano (base)"},
    {"id": "yolov8n-oiv7.pt", "label": "YOLOv8 OpenImagesV7"},
    {"id": "backend/trained_models/WildlifeDetection.pt", "label": "WildEye Custom"},
]

@router.post("/benchmark")
async def benchmark_models(
    image: Annotated[UploadFile, File(description="Benchmark image")]
):
    """Run the same image through multiple YOLO models and compare performance."""
    contents = await image.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")

    results = []
    
    for model_info in MODELS_TO_BENCHMARK:
        model_id = model_info["id"]
        label = model_info["label"]
        
        # Check if model exists
        if not Path(model_id).exists() and not model_id.endswith(".pt"):
             # For base models like 'yolov8n.pt', ultralytics handles download if not found
             # but we've seen them in the backend/ dir.
             pass

        start_time = time.perf_counter()
        try:
            model = get_yolo_model(model_id)
            # Run inference
            pred_results = model.predict(source=img, conf=0.25, verbose=False)[0]
            inference_time = (time.perf_counter() - start_time) * 1000  # ms
            
            detections = []
            top_detection = None
            
            if pred_results.boxes is not None:
                for i, conf in enumerate(pred_results.boxes.conf.cpu().numpy()):
                    cls_id = int(pred_results.boxes.cls[i])
                    species = pred_results.names.get(cls_id, f"Class {cls_id}").capitalize()
                    conf_val = float(conf)
                    bbox = pred_results.boxes.xyxy[i].cpu().numpy().tolist()
                    
                    det = {
                        "species": species,
                        "confidence": conf_val,
                        "bbox": bbox
                    }
                    detections.append(det)
                    
                    if top_detection is None or conf_val > top_detection["confidence"]:
                        top_detection = {"species": species, "confidence": conf_val}

            results.append({
                "model": model_id,
                "label": label,
                "inference_ms": round(inference_time, 2),
                "detections": len(detections),
                "top_detection": top_detection or {"species": "None", "confidence": 0.0},
                "all_detections": detections
            })
        except Exception as e:
            results.append({
                "model": model_id,
                "label": label,
                "error": str(e)
            })

    # Determine winner
    winner = None
    max_conf = -1.0
    for res in results:
        if "error" not in res and res["top_detection"]["confidence"] > max_conf:
            max_conf = res["top_detection"]["confidence"]
            winner = res["model"]

    return {
        "results": results,
        "winner": winner,
        "winner_reason": f"Highest confidence detection ({max_conf:.2f})" if winner else "No detections found"
    }
