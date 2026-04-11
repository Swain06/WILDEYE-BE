"""
Habitat suitability prediction (RandomForest from Colab untitled49 or PyTorch .pt).

Supports:
- joblib/pickle-saved RandomForestClassifier (e.g. HabitatSuitability.joblib or .pkl)
- PyTorch .pt model (torch.save); model must accept input shape (batch, 11) and output
  logits (batch,) or (batch, 1) or (batch, 2) for binary classification.

Features: temperature, rainfall, elevation, soil_ph, water_availability, vegetation_cover,
prey_density, predator_density, shelter_availability, human_disturbance, forest_fire_risk.
Target: binary (0 = Not Habitable, 1 = Habitable).
"""

import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_MODEL_PATH = Path("trained_models/HabitatSuitability.pt")
# Fallback names when default path is not set via env (try .pkl / .joblib if .pt missing)
DEFAULT_MODEL_ALTERNATIVES = (
    Path("trained_models/HabitatSuitability.pt"),
    Path("trained_models/HabitatSuitability.pkl"),
    Path("trained_models/HabitatSuitability.joblib"),
)

FEATURE_NAMES = [
    "temperature",
    "rainfall",
    "elevation",
    "soil_ph",
    "water_availability",
    "vegetation_cover",
    "prey_density",
    "predator_density",
    "shelter_availability",
    "human_disturbance",
    "forest_fire_risk",
]

_model = None


def _get_model_path() -> Path:
    raw = os.environ.get("HABITAT_MODEL_PATH")
    if raw:
        return Path(raw)
    for p in DEFAULT_MODEL_ALTERNATIVES:
        if p.exists():
            return p
    return DEFAULT_MODEL_PATH  # for error message if none exist


def is_model_available() -> bool:
    return _get_model_path().exists()


class _TorchHabitatWrapper:
    """Wraps a PyTorch model so it has .predict(X) and .predict_proba(X) like sklearn."""

    def __init__(self, raw: Any):
        import torch
        self._raw = raw
        self._device = torch.device("cpu")
        if hasattr(raw, "parameters"):
            try:
                p = next(iter(raw.parameters()), None)
                if p is not None:
                    self._device = p.device
            except StopIteration:
                pass
        if hasattr(raw, "eval"):
            raw.eval()

    def predict(self, X: np.ndarray) -> np.ndarray:
        import torch
        with torch.no_grad():
            t = torch.from_numpy(X.astype(np.float32)).to(self._device)
            out = self._raw(t)
            if out.dim() == 2:
                if out.shape[1] == 2:
                    out = out.argmax(dim=1)
                else:
                    out = (out.squeeze(1) > 0.5).long()
            else:
                out = (out.squeeze() > 0.5).long()
            return out.cpu().numpy()

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        import torch
        with torch.no_grad():
            t = torch.from_numpy(X.astype(np.float32)).to(self._device)
            out = self._raw(t)
            if out.dim() == 2 and out.shape[1] == 2:
                prob = torch.softmax(out, dim=1).cpu().numpy()
                return prob
            out = out.squeeze()
            if out.dim() == 0:
                out = out.unsqueeze(0)
            p1 = torch.sigmoid(out).cpu().numpy()
            p1 = np.clip(p1, 0.0, 1.0)
            return np.column_stack([1 - p1, p1])


def get_model() -> Any:
    """Load and cache the model (joblib or PyTorch .pt)."""
    global _model
    if _model is not None:
        return _model
    path = _get_model_path()
    if not path.exists():
        raise FileNotFoundError(
            f"Habitat model not found at {path.absolute()}. "
            "Use trained_models/HabitatSuitability.pt, .pkl, or .joblib, or set HABITAT_MODEL_PATH."
        )

    # Try joblib first (sklearn RandomForest)
    try:
        import joblib
        _model = joblib.load(path)
        logger.info("Loaded habitat model (joblib) from %s", path)
        return _model
    except Exception as e:
        if "ASCII" in str(e) or "persistent IDs" in str(e) or "UnpicklingError" in type(e).__name__ or "UnicodeDecodeError" in type(e).__name__:
            pass  # likely PyTorch .pt, try torch
        else:
            raise

    # Try PyTorch .pt (file may be torch.save(sklearn_model) or torch.save(nn.Module))
    try:
        import torch
        obj = torch.load(path, map_location="cpu", weights_only=False)
        if isinstance(obj, dict):
            raise ValueError(
                "HabitatSuitability.pt contains a state_dict (weights only). "
                "Save the full model with torch.save(model, path), or use a .joblib file for the sklearn RandomForest from Colab."
            )
        # sklearn model saved with torch.save (e.g. RandomForestClassifier) — use as-is
        if hasattr(obj, "predict") and "sklearn" in type(obj).__module__:
            _model = obj
            logger.info("Loaded habitat model (sklearn via torch) from %s", path)
            return _model
        if hasattr(obj, "eval") and callable(obj):
            _model = _TorchHabitatWrapper(obj)
        elif callable(obj):
            _model = _TorchHabitatWrapper(obj)
        else:
            raise ValueError(f"Loaded object from {path} is not a callable model: {type(obj)}")
        logger.info("Loaded habitat model (PyTorch) from %s", path)
        return _model
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(
            f"Could not load habitat model from {path}: joblib failed (PyTorch .pt?), and torch.load failed: {e}"
        ) from e


def build_features(
    *,
    temperature: float,
    rainfall: float,
    elevation: float,
    vegetation_cover: float,
    ndvi: float,
    soil_ph: float = 6.5,
    water_availability: float | None = None,
    prey_density: float = 0.5,
    predator_density: float = 0.2,
    shelter_availability: float = 0.7,
    human_disturbance: float = 0.3,
    forest_fire_risk: float = 0.2,
    feature_names: list[str] | None = None,
) -> np.ndarray:
    """Build feature vector. If feature_names (e.g. model.feature_names_in_) is given, use that order and fill unknown with 0.5."""
    if water_availability is None:
        water_availability = min(1.0, (rainfall / 3000.0) * 0.5 + ndvi * 0.5)
    known = {
        "temperature": temperature,
        "rainfall": rainfall,
        "elevation": elevation,
        "soil_ph": soil_ph,
        "water_availability": water_availability,
        "vegetation_cover": vegetation_cover,
        "prey_density": prey_density,
        "predator_density": predator_density,
        "shelter_availability": shelter_availability,
        "human_disturbance": human_disturbance,
        "forest_fire_risk": forest_fire_risk,
        "ndvi": ndvi,
    }
    if feature_names is not None:
        values = [known.get(str(n), 0.5) for n in feature_names]
        return np.array([values], dtype=np.float64)
    values = [
        temperature,
        rainfall,
        elevation,
        soil_ph,
        water_availability,
        vegetation_cover,
        prey_density,
        predator_density,
        shelter_availability,
        human_disturbance,
        forest_fire_risk,
    ]
    return np.array([values], dtype=np.float64)


def _factor_label(value: float, kind: str) -> str:
    """Heuristic factor labels for UI."""
    if kind == "temperature":
        if 20 <= value <= 30:
            return "Optimal"
        if 15 <= value <= 35:
            return "Suitable"
        return "Suboptimal"
    if kind == "rainfall":
        if value >= 1500:
            return "Sufficient"
        if value >= 800:
            return "Moderate"
        return "Low"
    if kind == "elevation":
        if 200 <= value <= 2500:
            return "Suitable"
        if 0 <= value <= 4000:
            return "Moderate"
        return "Unsuitable"
    if kind == "forestCover":
        if value >= 60:
            return "Good"
        if value >= 30:
            return "Moderate"
        return "Poor"
    if kind == "ndvi":
        if value >= 0.6:
            return "Healthy"
        if value >= 0.3:
            return "Moderate"
        return "Low"
    return "Moderate"


def predict_habitat(
    temperature: float,
    rainfall: float,
    elevation: float,
    vegetation_cover: float,
    ndvi: float,
    **kwargs: float,
) -> tuple[str, float, dict[str, str]]:
    """
    Predict habitat suitability (High/Medium/Low) and confidence, plus factor labels.

    Returns:
        (suitability, confidence_pct, factors_dict)
    """
    model = get_model()
    # Use model's expected feature order when available (e.g. 22-feature trained model)
    feature_names = None
    if hasattr(model, "feature_names_in_"):
        feature_names = list(model.feature_names_in_)
    X = build_features(
        temperature=temperature,
        rainfall=rainfall,
        elevation=elevation,
        vegetation_cover=vegetation_cover,
        ndvi=ndvi,
        feature_names=feature_names,
        **kwargs,
    )
    pred = model.predict(X)[0]
    proba = getattr(model, "predict_proba", None)
    if proba is not None:
        proba_arr = proba(X)[0]
        confidence_pct = float(proba_arr[1] * 100.0) if pred == 1 else float(proba_arr[0] * 100.0)
    else:
        confidence_pct = 85.0 if pred == 1 else 75.0

    if pred == 1:
        suitability = "High" if confidence_pct >= 70 else "Medium"
    else:
        suitability = "Low" if confidence_pct >= 60 else "Medium"

    factors = {
        "temperature": _factor_label(temperature, "temperature"),
        "rainfall": _factor_label(rainfall, "rainfall"),
        "elevation": _factor_label(elevation, "elevation"),
        "forestCover": _factor_label(vegetation_cover, "forestCover"),
        "ndvi": _factor_label(ndvi, "ndvi"),
    }
    return suitability, round(confidence_pct, 1), factors
