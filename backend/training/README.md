# Wildlife Detection Fine-tuning

This directory contains scripts and documentation for fine-tuning the WildEye detection models.

## 1. Data Collection

The recommended dataset for fine-tuning is the **iNaturalist Wildlife Subset** available on **LILA BC**.

- **Source:** [LILA BC (lila.science)](https://lila.science/datasets/)
- **Recommended Dataset:** [iNaturalist 2021](https://github.com/visipedia/inat_comp/tree/master/2021) or any wildlife-specific subset.

### Downloading the data:
1. Visit [lila.science/datasets](https://lila.science/datasets/).
2. Look for iNaturalist or specific camera trap datasets (e.g., Caltech Camera Traps).
3. Download the images and annotations.

## 2. Converting to YOLO Format

Most LILA datasets provide annotations in **COCO JSON** format. YOLO requires labels in a specific `.txt` format (one per image).

### Conversion Steps:
You can use the `ultralytics` library or dedicated scripts to convert COCO to YOLO.

```python
from ultralytics.data.converter import convert_coco
convert_coco(labels_dir='path/to/coco/annotations/', use_segments=False)
```

Alternatively, use [JSON2YOLO](https://github.com/ultralytics/JSON2YOLO) or [Roboflow](https://roboflow.com/) for easy conversion.

**Expected Structure:**
```text
dataset/
├── images/
│   ├── train/ (images)
│   └── val/ (images)
└── labels/
    ├── train/ (txt files)
    └── val/ (txt files)
```

Create a `data.yaml` file:
```yaml
path: ../dataset  # dataset root dir
train: images/train
val: images/val

# Classes
names:
  0: animal
  1: bird
  2: human
  # ... add more classes as per your dataset
```

## 3. Running the Fine-tuning Script

Once your dataset is ready in YOLO format, run the training script:

```bash
python backend/training/finetune.py --data path/to/data.yaml --epochs 50 --base backend/trained_models/WildlifeDetection.pt
```

**Parameters:**
- `--data`: Path to your `data.yaml` file.
- `--epochs`: Number of training rounds (default: 50).
- `--base`: The starting model weights.

## 4. Replacing the Production Model

After training, the best weights will be saved (typically in `runs/detect/WildEye_finetuned/weights/best.pt`).

To deploy the new model:
1. Backup your old model:
   ```bash
   mv backend/trained_models/WildlifeDetection.pt backend/trained_models/WildlifeDetection.pt.bak
   ```
2. Copy the new model:
   ```bash
   cp runs/detect/WildEye_finetuned/weights/best.pt backend/trained_models/WildlifeDetection.pt
   ```
3. Restart the backend service:
   ```bash
   # If using uvicorn reload, it might pick it up automatically
   # Otherwise, restart your service
   ```
