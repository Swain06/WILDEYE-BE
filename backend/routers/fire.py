"""Fire risk prediction API: from dataset model (xlsx/CSV-trained RF) or from image (CNN .pth)."""

import base64
import binascii
import logging
from datetime import datetime, timezone
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from config import settings
from detection.cloudinary_uploader import upload_image_bytes
from detection.schemas import FirePrediction, FireHotspot, FireRiskLevel, Location
from detection.wildfire_predictor import predict_from_image

try:
    from detection.fire_risk_predictor import (
        build_features,
        is_model_available as is_dataset_model_available,
        predict_fire_risk,
    )
except Exception:
    is_dataset_model_available = lambda: False
    build_features = None
    predict_fire_risk = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fire", tags=["Fire Prediction"])

FIRE_HOTSPOTS_COLLECTION = "fire_hotspots"


def get_db(request: Request) -> AsyncIOMotorDatabase:
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


RECOMMENDATIONS = {
    "Low": "Conditions are favorable. Continue routine monitoring.",
    "Medium": "Elevated risk detected. Increase patrol frequency and ensure firefighting equipment is ready.",
    "High": "High fire risk! Alert fire response teams and prepare for potential evacuation.",
    "Critical": "CRITICAL ALERT! Immediate action required. Activate all emergency protocols and notify authorities.",
}


def _probability_to_risk_level(probability: float) -> FireRiskLevel:
    if probability >= 0.75:
        return "Critical"
    if probability >= 0.5:
        return "High"
    if probability >= 0.3:
        return "Medium"
    return "Low"


def _rule_based_forecast(base_prob: float) -> list[dict]:
    """7-day forecast holding base probability flat — used as fallback when OWM is unavailable."""
    return [{"day": day, "probability": round(base_prob, 4)} for day in range(1, 8)]


async def _make_forecast(base_prob: float, lat: float, lon: float) -> list[dict]:
    """
    Bug 4 fix: fetch real 5-day/3-hour forecast from OpenWeatherMap and derive daily fire
    risk scores.  Falls back to a flat rule-based estimate on any error.

    Score per day = clamp(temp_norm + low_humidity_norm + wind_norm, 0, 1)
      temp_norm        = (avg_celsius) / 50        [35 °C → 0.70]
      low_humidity_norm = 1 - avg_humidity / 100   [humidity 30 % → 0.70]
      wind_norm        = avg_wind_m_s / 30         [15 m/s → 0.50]
    The three components are blended (average) and then scaled to [0.05, 0.95].
    """
    api_key = settings.OPENWEATHER_API_KEY
    if not api_key:
        logger.debug("OPENWEATHER_API_KEY not set; using rule-based forecast fallback.")
        return _rule_based_forecast(base_prob)

    try:
        url = (
            f"https://api.openweathermap.org/data/2.5/forecast"
            f"?lat={lat}&lon={lon}&cnt=40&units=metric&appid={api_key}"
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        # Group 3-hourly entries by calendar day (UTC date string)
        day_buckets: dict[str, list[dict]] = {}
        for entry in data.get("list", []):
            day_key = entry["dt_txt"][:10]  # e.g. "2024-06-01"
            day_buckets.setdefault(day_key, []).append(entry)

        forecast: list[dict] = []
        for day_idx, (_day, entries) in enumerate(sorted(day_buckets.items()), start=1):
            if day_idx > 7:
                break
            temps = [e["main"]["temp"] for e in entries]
            humids = [e["main"]["humidity"] for e in entries]
            winds = [e["wind"]["speed"] for e in entries]

            avg_temp = sum(temps) / len(temps)
            avg_humidity = sum(humids) / len(humids)
            avg_wind = sum(winds) / len(winds)   # m/s

            temp_norm = min(avg_temp / 50.0, 1.0)
            hum_norm = max(1.0 - avg_humidity / 100.0, 0.0)
            wind_norm = min(avg_wind / 30.0, 1.0)

            score = (temp_norm + hum_norm + wind_norm) / 3.0
            score = max(0.05, min(0.95, score))
            forecast.append({"day": day_idx, "probability": round(score, 4)})

        # Pad to 7 days if OWM returned fewer (e.g. only 5 distinct days)
        while len(forecast) < 7:
            last_prob = forecast[-1]["probability"] if forecast else base_prob
            forecast.append({"day": len(forecast) + 1, "probability": round(last_prob, 4)})

        return forecast

    except Exception as exc:
        logger.warning("OpenWeatherMap forecast failed (%s); using rule-based fallback.", exc)
        return _rule_based_forecast(base_prob)


async def _save_hotspot(db: AsyncIOMotorDatabase, prediction: FirePrediction) -> str:
    """Persist a fire prediction as a hotspot; return its id."""
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "location": prediction.location.model_dump(),
        "riskLevel": prediction.riskLevel,
        "probability": prediction.probability,
        "timestamp": now,
    }
    result = await db[FIRE_HOTSPOTS_COLLECTION].insert_one(doc)
    return str(result.inserted_id)


@router.get("/hotspots", response_model=dict)
async def list_fire_hotspots(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    riskLevel: Annotated[str | None, Query(description="Filter by risk: Low, Medium, High, Critical")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """List saved fire hotspots (from predictions)."""
    filter_query: dict = {}
    if riskLevel and riskLevel in ("Low", "Medium", "High", "Critical"):
        filter_query["riskLevel"] = riskLevel
    cursor = db[FIRE_HOTSPOTS_COLLECTION].find(filter_query).sort("timestamp", -1).skip(offset).limit(limit)
    total = await db[FIRE_HOTSPOTS_COLLECTION].count_documents(filter_query)
    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        items.append(FireHotspot(**doc))
    return {"items": [h.model_dump() for h in items], "total": total}


@router.post("/predict", response_model=FirePrediction)
async def predict_fire_from_params(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    latitude: Annotated[float, Form()],
    longitude: Annotated[float, Form()],
    temperature: Annotated[float, Form()],
    humidity: Annotated[float, Form()],
    windSpeed: Annotated[float, Form()],
    ndvi: Annotated[float, Form()],
    month: Annotated[str, Form()],
    location_name: Annotated[str | None, Form()] = None,
    # Optional params matching firepredf.ipynb / xlsx dataset (defaults used if omitted)
    landcover: Annotated[int | None, Form()] = None,
    precip_mm: Annotated[float | None, Form()] = None,
    drought_index: Annotated[float | None, Form()] = None,
    distance_to_road_km: Annotated[float | None, Form()] = None,
    elevation_m: Annotated[float | None, Form()] = None,
    slope_deg: Annotated[float | None, Form()] = None,
    human_activity_idx: Annotated[float | None, Form()] = None,
    previous_fire: Annotated[int | None, Form()] = None,
    fire_probability_input: Annotated[float | None, Form()] = None,
):
    """
    Predict fire risk from environmental conditions.

    Uses the dataset-trained model (fire_model.joblib + fire_scaler.joblib from firepredf.ipynb)
    when available; otherwise falls back to rule-based logic.
    Frontend sends: latitude, longitude, temperature, humidity, windSpeed (km/h), ndvi, month.
    Optional: landcover, precip_mm, drought_index, distance_to_road_km, elevation_m, slope_deg,
    human_activity_idx, previous_fire, fire_probability_input (dataset feature).
    """
    location = Location(
        lat=latitude,
        lon=longitude,
        name=location_name or f"Location {latitude:.2f}, {longitude:.2f}",
    )

    if is_dataset_model_available() and build_features is not None and predict_fire_risk is not None:
        try:
            features = build_features(
                latitude=latitude,
                longitude=longitude,
                temperature=temperature,
                humidity=humidity,
                windSpeed=windSpeed,
                ndvi=ndvi,
                month=month,
                landcover=landcover if landcover is not None else 1,
                precip_mm=precip_mm if precip_mm is not None else 0.0,
                drought_index=drought_index if drought_index is not None else 0.3,
                distance_to_road_km=distance_to_road_km if distance_to_road_km is not None else 5.0,
                elevation_m=elevation_m if elevation_m is not None else 200.0,
                slope_deg=slope_deg if slope_deg is not None else 5.0,
                human_activity_idx=human_activity_idx if human_activity_idx is not None else 0.3,
                previous_fire=previous_fire if previous_fire is not None else 0,
                fire_probability=fire_probability_input if fire_probability_input is not None else 0.3,
            )
            fire_occurrence, probability = predict_fire_risk(features)
            risk_level = _probability_to_risk_level(probability)
            # Bug 4 fix: use real OWM forecast (with graceful fallback)
            forecast = await _make_forecast(probability, latitude, longitude)
            result = FirePrediction(
                riskLevel=risk_level,
                probability=probability,
                forecast=forecast,
                recommendations=RECOMMENDATIONS[risk_level],
                location=location,
            )
            await _save_hotspot(db, result)
            return result
        except Exception as e:
            # Fall through to rule-based if model fails (e.g. wrong feature shape)
            logger.warning("Dataset fire model failed, using rule-based: %s", e)

    # Rule-based fallback (same logic as before)
    risk_score = 0.0
    if temperature > 35:
        risk_score += 30
    elif temperature > 30:
        risk_score += 20
    elif temperature > 25:
        risk_score += 10

    if humidity < 30:
        risk_score += 30
    elif humidity < 50:
        risk_score += 20
    elif humidity < 70:
        risk_score += 10

    if windSpeed > 30:
        risk_score += 25
    elif windSpeed > 20:
        risk_score += 15
    elif windSpeed > 10:
        risk_score += 5

    if risk_score >= 70:
        risk_level: FireRiskLevel = "Critical"
        probability = 0.85
    elif risk_score >= 50:
        risk_level = "High"
        probability = 0.65
    elif risk_score >= 30:
        risk_level = "Medium"
        probability = 0.4
    else:
        risk_level = "Low"
        probability = 0.2

    forecast = await _make_forecast(probability, latitude, longitude)
    result = FirePrediction(
        riskLevel=risk_level,
        probability=probability,
        forecast=forecast,
        recommendations=RECOMMENDATIONS[risk_level],
        location=location,
    )
    await _save_hotspot(db, result)
    return result


@router.post("/predict-image", response_model=FirePrediction)
async def predict_fire_from_image(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    image: Annotated[UploadFile, File(description="Forest/satellite image to classify")],
    latitude: Annotated[float | None, Form()] = None,
    longitude: Annotated[float | None, Form()] = None,
    location_name: Annotated[str | None, Form()] = None,
):
    """Predict wildfire risk from an image using the CNN model (WildfirePrediction.pth)."""
    lat = latitude if latitude is not None else 20.5937  # Default: centre of India
    lon = longitude if longitude is not None else 78.9629
    location = Location(
        lat=lat,
        lon=lon,
        name=location_name or "Unknown",
    )

    contents = await image.read()
    has_risk, probability = predict_from_image(image=contents)

    # Bug 1 fix: upload image to Cloudinary
    image_url = upload_image_bytes(contents, folder="wildeye/fire")

    risk_level = _probability_to_risk_level(probability)
    # Bug 4 fix: use real OWM forecast (with graceful fallback)
    forecast = await _make_forecast(probability, lat, lon)
    result = FirePrediction(
        riskLevel=risk_level,
        probability=probability,
        forecast=forecast,
        recommendations=RECOMMENDATIONS[risk_level],
        location=location,
        imageUrl=image_url,
    )
    await _save_hotspot(db, result)
    return result

