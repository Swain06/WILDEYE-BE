"""Habitat suitability prediction API (RandomForest from Colab untitled49)."""

from typing import Annotated
from fastapi import APIRouter, Form, File, UploadFile
import base64
from datetime import datetime
from detection.schemas import HabitatPrediction
from detection.habitat_predictor import (
    is_model_available,
    predict_habitat,
)

router = APIRouter(prefix="/api/habitat", tags=["Habitat Suitability"])


@router.post("/predict", response_model=HabitatPrediction)
async def predict_habitat_suitability(
    species: Annotated[str, Form(description="Species: Deer, Boar, Fox, Hare, Bear, Wolf, Tiger, Elephant, Lion")],
    region: Annotated[str, Form(description="Region name for display")],
    temperature: Annotated[float, Form(description="Temperature °C")],
    rainfall: Annotated[float, Form(description="Rainfall mm")],
    elevation: Annotated[float, Form(description="Elevation m")],
    forestCover: Annotated[float, Form(description="Forest/vegetation cover %")],
    ndvi: Annotated[float, Form(description="NDVI 0–1")],
    soil_ph: Annotated[float | None, Form()] = None,
    water_availability: Annotated[float | None, Form()] = None,
    prey_density: Annotated[float | None, Form()] = None,
    predator_density: Annotated[float | None, Form()] = None,
    shelter_availability: Annotated[float | None, Form()] = None,
    human_disturbance: Annotated[float | None, Form()] = None,
    forest_fire_risk: Annotated[float | None, Form()] = None,
):
    """
    Predict habitat suitability for a species using the RandomForest model
    (trained as in backend/detection/untitled49.py).
    """
    if not is_model_available():
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Habitat model not available. Place HabitatSuitability.joblib (or .pt) in trained_models/ or set HABITAT_MODEL_PATH.",
        )
    kwargs = {}
    if soil_ph is not None:
        kwargs["soil_ph"] = soil_ph
    if water_availability is not None:
        kwargs["water_availability"] = water_availability
    if prey_density is not None:
        kwargs["prey_density"] = prey_density
    if predator_density is not None:
        kwargs["predator_density"] = predator_density
    if shelter_availability is not None:
        kwargs["shelter_availability"] = shelter_availability
    if human_disturbance is not None:
        kwargs["human_disturbance"] = human_disturbance
    if forest_fire_risk is not None:
        kwargs["forest_fire_risk"] = forest_fire_risk

    suitability, confidence, factors = predict_habitat(
        temperature=temperature,
        rainfall=rainfall,
        elevation=elevation,
        vegetation_cover=forestCover,
        ndvi=ndvi,
        **kwargs,
    )
    return HabitatPrediction(
        suitability=suitability,
        confidence=confidence,
        factors=factors,
        species=species,
        region=region,
    )
