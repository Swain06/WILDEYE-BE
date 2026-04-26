"""
Wildfire image classification using a PyTorch CNN (.pth).

Model file: trained_models/WildfirePrediction.pth (state_dict from Colab CNN).
Override via WILDFIRE_MODEL_PATH env.

Architecture and transform must match training (forestfire.py / Colab):
- Transform: Resize(128,128), ToTensor(), Normalize(0.5, 0.5, 0.5)
- CNNModel: conv_layers → fc_layers → 2 classes (0: NO WILDFIRE RISK, 1: WILDFIRE RISK)
"""

import io
import logging
import os
from pathlib import Path
from typing import Union

import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

DEFAULT_MODEL_PATH = Path("trained_models/WildfirePrediction.pt")

_model = None
_transform = None
_device = None


def _get_device():
    global _device
    if _device is None:
        import torch
        _device = torch.device(
            "cuda" if torch.cuda.is_available() else
            "mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else
            "cpu"
        )
        logger.info("Wildfire predictor device: %s", _device)
    return _device


def _get_transform():
    """Same as Colab: Resize(128,128), ToTensor(), Normalize(0.5, 0.5, 0.5)."""
    global _transform
    if _transform is None:
        from torchvision import transforms
        _transform = transforms.Compose([
            transforms.Resize((128, 128)),
            transforms.ToTensor(),
            transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
        ])
    return _transform


class CNNModel(nn.Module):
    """Same architecture as Colab forestfire.py."""

    def __init__(self):
        super().__init__()
        self.conv_layers = nn.Sequential(
            nn.Conv2d(3, 32, 3, 1, 1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),
            nn.Conv2d(32, 64, 3, 1, 1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2),
        )
        self.fc_layers = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 32 * 32, 128),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(128, 2),
        )

    def forward(self, x):
        x = self.conv_layers(x)
        x = self.fc_layers(x)
        return x


def get_model(model_path: Union[str, Path, None] = None):
    """Load and cache the wildfire CNN. Uses WILDFIRE_MODEL_PATH env if model_path is None."""
    global _model
    path = Path(os.environ.get("WILDFIRE_MODEL_PATH", str(DEFAULT_MODEL_PATH))) if model_path is None else Path(model_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Wildfire model not found at {path.absolute()}. "
            "Place WildfirePrediction.pth in backend/trained_models/ or set WILDFIRE_MODEL_PATH."
        )
    if _model is None:
        device = _get_device()
        _model = CNNModel().to(device)
        _model.load_state_dict(torch.load(path, map_location=device))
        _model.eval()
        logger.info("Loaded wildfire CNN from %s", path)
    return _model


def is_model_available(model_path: Union[str, Path, None] = None) -> bool:
    path = Path(os.environ.get("WILDFIRE_MODEL_PATH", str(DEFAULT_MODEL_PATH))) if model_path is None else Path(model_path)
    return path.exists()


def predict_from_image(image: Union[str, Path, bytes]) -> tuple[bool, float]:
    """
    Classify image as wildfire risk or not using the CNN.

    Args:
        image: Image as file path (str/Path) or bytes.

    Returns:
        (has_wildfire_risk: bool, probability: float)
        probability is the model confidence for class 1 (WILDFIRE RISK), 0–1.
    """
    from PIL import Image

    model = get_model()
    transform = _get_transform()
    device = _get_device()

    if isinstance(image, bytes):
        pil_img = Image.open(io.BytesIO(image)).convert("RGB")
    else:
        pil_img = Image.open(image).convert("RGB")

    tensor = transform(pil_img).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)
        prob_wildfire = float(probs[0, 1])
        predicted = 1 if prob_wildfire >= 0.5 else 0

    has_risk = predicted == 1
    return has_risk, prob_wildfire
