"""
Fire risk prediction using the dataset-based model (RandomForest from firepredf.ipynb).

Expects trained model and scaler saved as joblib in trained_models/:
- fire_model.joblib (e.g. best_rf from RandomizedSearchCV)
- fire_scaler.joblib (StandardScaler fitted on training data)

Feature set must match training: X = df.drop('fire_occurrence', axis=1).
See firepredf.ipynb and docs/FIRE_RISK_MODEL_EXPORT.md for how to export from the notebook.
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Default paths under backend/
DEFAULT_MODEL_PATH = Path("trained_models/fire_model.joblib")
DEFAULT_SCALER_PATH = Path("trained_models/fire_scaler.joblib")

# Feature order must match the DataFrame columns used in training (X = df.drop('fire_occurrence', axis=1))
FEATURE_NAMES = [
    "date",
    "latitude",
    "longitude",
    "month",
    "landcover",
    "ndvi",
    "lst_c",
    "temperature_c",
    "humidity_pct",
    "wind_speed_m_s",
    "precip_mm",
    "drought_index",
    "distance_to_road_km",
    "elevation_m",
    "slope_deg",
    "human_activity_idx",
    "previous_fire",
    "fire_probability",
]

_model = None
_scaler = None


def _get_paths():
    model_path = Path(os.environ.get("FIRE_MODEL_PATH", str(DEFAULT_MODEL_PATH)))
    scaler_path = Path(os.environ.get("FIRE_SCALER_PATH", str(DEFAULT_SCALER_PATH)))
    return model_path, scaler_path


def is_model_available() -> bool:
    """Return True if both model and scaler files exist."""
    model_path, scaler_path = _get_paths()
    return model_path.exists() and scaler_path.exists()


def get_model_and_scaler():
    """Load and cache the RandomForest model and StandardScaler."""
    global _model, _scaler
    model_path, scaler_path = _get_paths()
    if not model_path.exists():
        raise FileNotFoundError(f"Fire model not found at {model_path.absolute()}")
    if not scaler_path.exists():
        raise FileNotFoundError(f"Fire scaler not found at {scaler_path.absolute()}")

    if _model is None:
        import joblib
        _model = joblib.load(model_path)
        _scaler = joblib.load(scaler_path)
        logger.info("Loaded fire risk model and scaler from %s, %s", model_path, scaler_path)
    return _model, _scaler


def _month_name_to_int(month: str) -> int:
    """Convert 'January', 'March', etc. to 1-12."""
    months = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    ]
    if isinstance(month, (int, float)):
        return int(month) if 1 <= int(month) <= 12 else 1
    s = str(month).strip().lower()
    for i, m in enumerate(months):
        if m.startswith(s) or s == m:
            return i + 1
    return 1


def build_features(
    *,
    latitude: float,
    longitude: float,
    temperature: float,
    humidity: float,
    windSpeed: float,
    ndvi: float,
    month: str | int,
    date: int | None = None,
    landcover: int = 1,
    lst_c: float | None = None,
    precip_mm: float = 0.0,
    drought_index: float = 0.3,
    distance_to_road_km: float = 5.0,
    elevation_m: float = 200.0,
    slope_deg: float = 5.0,
    human_activity_idx: float = 0.3,
    previous_fire: int = 0,
    fire_probability: float = 0.3,
) -> dict[str, Any]:
    """
    Build the feature dict expected by the model (same columns as training).

    - month: frontend sends "March" etc. -> converted to 1-12.
    - windSpeed: frontend typically in km/h -> converted to wind_speed_m_s (m/s) = windSpeed / 3.6.
    - lst_c: if not provided, use temperature (Land Surface Temp ~ air temp).
    """
    month_int = _month_name_to_int(month) if isinstance(month, str) else int(month)
    if month_int < 1 or month_int > 12:
        month_int = 1

    if date is None:
        date = int(datetime.utcnow().strftime("%Y%m%d"))

    wind_speed_m_s = float(windSpeed) / 3.6 if windSpeed is not None else 5.0
    lst = float(lst_c) if lst_c is not None else float(temperature)

    return {
        "date": date,
        "latitude": float(latitude),
        "longitude": float(longitude),
        "month": month_int,
        "landcover": int(landcover),
        "ndvi": float(ndvi),
        "lst_c": lst,
        "temperature_c": float(temperature),
        "humidity_pct": float(humidity),
        "wind_speed_m_s": wind_speed_m_s,
        "precip_mm": float(precip_mm),
        "drought_index": float(drought_index),
        "distance_to_road_km": float(distance_to_road_km),
        "elevation_m": float(elevation_m),
        "slope_deg": float(slope_deg),
        "human_activity_idx": float(human_activity_idx),
        "previous_fire": int(previous_fire),
        "fire_probability": float(fire_probability),
    }


def predict_fire_risk(features: dict[str, Any]) -> tuple[int, float]:
    """
    Predict fire occurrence (0 or 1) and probability of fire (class 1) using the dataset model.

    Args:
        features: dict with keys matching FEATURE_NAMES (same as training).

    Returns:
        (fire_occurrence: 0 or 1, probability_fire: float in [0, 1])
    """
    model, scaler = get_model_and_scaler()

    # Build row in same column order as training
    row = np.array([[features[k] for k in FEATURE_NAMES]], dtype=np.float64)
    row_scaled = scaler.transform(row)

    pred = model.predict(row_scaled)[0]
    pred_int = int(pred)

    # Probability of class 1 (fire)
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(row_scaled)[0]
        # Class 1 is typically "fire" (1), class 0 is "no fire" (0)
        if proba.shape[0] > 1:
            prob_fire = float(proba[1])
        else:
            prob_fire = float(proba[0]) if pred_int == 1 else 1.0 - float(proba[0])
    else:
        prob_fire = 0.8 if pred_int == 1 else 0.2

    return pred_int, round(prob_fire, 4)
