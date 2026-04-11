"""
Grad-CAM explainability for wildlife detection.

Uses EigenCAM (SVD-based, no class targets needed) which reliably works with
YOLO detection models. A lightweight nn.Module wrapper ensures the forward pass
returns a plain tensor rather than the tuple that YOLO normally emits, avoiding
the 'tuple has no attribute cpu' error in pytorch-grad-cam.
"""

from __future__ import annotations

import base64
import io
import logging

import httpx
import numpy as np
import cv2
import torch
import torch.nn as nn
from PIL import Image

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────
# YOLO-compatible wrapper for pytorch-grad-cam
# ─────────────────────────────────────────────────────────────────

class _YOLOWrapper(nn.Module):
    """
    Wraps a YOLO nn.Module so its forward pass returns a single tensor
    (the first element of the tuple that Ultralytics YOLO emits).
    pytorch-grad-cam requires a plain tensor output.
    """

    def __init__(self, yolo_nn: nn.Module) -> None:
        super().__init__()
        self.model = yolo_nn

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.model(x)
        # Ultralytics YOLO returns (predictions, extra) or just a tensor
        if isinstance(out, (tuple, list)):
            out = out[0]
        # out shape varies; flatten to [B, -1] for GradCAM scoring
        if out.dim() > 2:
            out = out.flatten(1)
        return out


# ─────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────

def _load_image_from_url(url: str) -> np.ndarray:
    """Download an image from a URL, return RGB float32 [0,1] ndarray."""
    try:
        resp = httpx.get(url, timeout=20, follow_redirects=True)
        resp.raise_for_status()
        pil_img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        return np.array(pil_img, dtype=np.float32) / 255.0
    except (httpx.HTTPError, IOError) as exc:
        logger.error(f"Failed to load image for Grad-CAM from {url}: {exc}")
        raise RuntimeError(
            f"Image source is inaccessible or invalid (404/403). Grad-CAM requires a valid image URL. Error: {exc}"
        ) from exc


def _preprocess_tensor(img_float: np.ndarray) -> torch.Tensor:
    """[H,W,3] float32 → [1,3,H,W] torch tensor."""
    return torch.from_numpy(img_float.transpose(2, 0, 1)).unsqueeze(0)


def _build_explanation(species: str, grayscale_cam: np.ndarray) -> str:
    """Generate a human-readable explanation from heatmap statistics."""
    peak = float(grayscale_cam.max())
    mean = float(grayscale_cam.mean())

    if peak > 0.75:
        attention = "highly concentrated"
    elif peak > 0.45:
        attention = "moderately focused"
    else:
        attention = "broadly distributed"

    h, w = grayscale_cam.shape
    hot = grayscale_cam > grayscale_cam.max() * 0.6
    if hot.any():
        coords = np.argwhere(hot).mean(axis=0)  # (cy, cx)
        cy, cx = float(coords[0]), float(coords[1])
    else:
        cy, cx = h / 2.0, w / 2.0

    v_pos = "upper" if cy < h / 3 else ("lower" if cy > 2 * h / 3 else "central")
    h_pos = "left"  if cx < w / 3 else ("right"  if cx > 2 * w / 3 else "middle")

    return (
        f"The model's attention was {attention} on the {v_pos}-{h_pos} region "
        f"(mean activation {mean:.2f}). This typically corresponds to the body outline, "
        f"distinctive coat pattern, or characteristic features of {species}."
    )


# ─────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────

def generate_gradcam(
    image_url: str,
    species: str,
    model_name: str = "yolov8n-oiv7.pt",
) -> dict:
    """
    Run EigenCAM on the YOLO backbone for the image at *image_url*.

    Returns
    -------
    dict with:
        gradcam_image : str   — base64-encoded PNG of the heatmap overlay
        explanation   : str   — human-readable attention description
    """
    try:
        from pytorch_grad_cam import EigenCAM
        from pytorch_grad_cam.utils.image import show_cam_on_image
    except ImportError as exc:
        raise RuntimeError(
            "pytorch-grad-cam is not installed. Run: pip install grad-cam"
        ) from exc

    from detection.yolo_detector import get_yolo_model

    # 1. Load cached YOLO model and wrap it
    yolo = get_yolo_model(model_name)
    pytorch_nn: nn.Module = yolo.model          # the underlying nn.Module
    pytorch_nn.eval()
    wrapped = _YOLOWrapper(pytorch_nn)

    # 2. Pick target layer: second-to-last block of the YOLO backbone sequence
    try:
        target_layers = [pytorch_nn.model[-2]]
    except (AttributeError, IndexError) as exc:
        raise RuntimeError(f"Could not extract target layer from YOLO model: {exc}") from exc

    # 3. Download & preprocess
    img_float = _load_image_from_url(image_url)             # [H, W, 3]
    cam_size = 224
    img_resized = cv2.resize(img_float, (cam_size, cam_size))  # [224, 224, 3]
    input_tensor = _preprocess_tensor(img_resized)             # [1, 3, 224, 224]

    # 4. EigenCAM (SVD of feature activations — no gradient issues with detection heads)
    cam = EigenCAM(model=wrapped, target_layers=target_layers)
    grayscale_cam = cam(input_tensor=input_tensor, targets=None)[0]  # [224, 224]

    # 5. Blend with original resized image
    visualization = show_cam_on_image(img_resized, grayscale_cam, use_rgb=True)

    # 6. Upscale overlay back to original image size
    orig_h, orig_w = img_float.shape[:2]
    vis_full = cv2.resize(visualization, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

    # 7. Encode to base64 PNG
    bgr = cv2.cvtColor(vis_full, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".png", bgr)
    if not ok:
        raise RuntimeError("Failed to encode Grad-CAM output as PNG")

    b64_image = base64.b64encode(buf.tobytes()).decode("utf-8")
    explanation = _build_explanation(species, grayscale_cam)

    return {"gradcam_image": b64_image, "explanation": explanation}
