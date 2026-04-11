# Fine-tuning script for WildlifeDetection.pt
# Uses iNaturalist-subset or any local dataset in YOLO format
#
# Usage: python backend/training/finetune.py --data data.yaml --epochs 50
#
# Dataset format expected (YOLO):
# dataset/
#   images/train/  *.jpg
#   images/val/    *.jpg
#   labels/train/  *.txt
#   labels/val/    *.txt

from ultralytics import YOLO
import argparse
import os

def finetune(data_yaml: str, epochs: int, base_model: str):
    # Ensure base model exists
    if not os.path.exists(base_model):
        print(f"Warning: Base model {base_model} not found. Attempting to use default yolov8n.pt")
        base_model = "yolov8n.pt"
        
    model = YOLO(base_model)
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=640,
        batch=16,
        name="WildEye_finetuned",
        patience=10,
        save=True
    )
    # Save fine-tuned model
    model.export(format="pt")
    
    # After training, the best model is usually in runs/detect/WildEye_finetuned/weights/best.pt
    # The model.export() actually exports the CURRENT model state.
    # YOLO.train often leaves the best weights in a specific directory.
    
    print(f"Fine-tuned model saved. mAP50: {results.results_dict['metrics/mAP50(B)']:.4f}")
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="Path to data.yaml file")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--base", default="backend/trained_models/WildlifeDetection.pt", help="Path to base model weights")
    args = parser.parse_args()
    finetune(args.data, args.epochs, args.base)
