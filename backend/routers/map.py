"""Map data aggregation API — returns all geo-tagged markers in one call for the map view."""

import math
from typing import Annotated

from fastapi import APIRouter, Depends, Request, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/map", tags=["Map"])

DETECTIONS_COLLECTION = "detections"
POACHING_COLLECTION = "poaching_alerts"
FIRE_COLLECTION = "fire_hotspots"


def get_db(request: Request) -> AsyncIOMotorDatabase:
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


def safe_float(v, default: float = 0.0) -> float:
    """Convert v to float, replacing NaN/Inf/None with default."""
    try:
        f = float(v)
        return f if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default


def safe_str(v, default: str = "") -> str:
    return str(v) if v is not None else default


@router.get("/data")
async def get_map_data(db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]):
    """
    Return all geo-tagged markers aggregated across wildlife detections,
    poaching alerts, and fire hotspots.  Only documents with non-zero
    lat/lon are included.  All floats are sanitised to avoid JSON errors.
    """

    # ── Wildlife detections ────────────────────────────────────────────────
    wildlife = []
    async for doc in db[DETECTIONS_COLLECTION].find(
        {},
        {"_id": 0, "id": 1, "species": 1, "confidence": 1,
         "imageUrl": 1, "timestamp": 1, "location": 1},
    ).sort("timestamp", -1).limit(500):
        loc = doc.get("location") or {}
        lat = safe_float(loc.get("lat") or loc.get("latitude"))
        lng = safe_float(loc.get("lon") or loc.get("longitude"))
        if lat == 0.0 and lng == 0.0:
            continue
        wildlife.append({
            "id": safe_str(doc.get("id")),
            "lat": lat,
            "lng": lng,
            "species": safe_str(doc.get("species"), "Unknown"),
            "confidence": safe_float(doc.get("confidence")),
            "imageUrl": doc.get("imageUrl"),
            "timestamp": safe_str(doc.get("timestamp")),
        })

    # ── Poaching alerts ────────────────────────────────────────────────────
    poaching = []
    async for doc in db[POACHING_COLLECTION].find(
        {},
        {"_id": 0, "id": 1, "status": 1, "confidence": 1,
         "imageUrl": 1, "timestamp": 1, "location": 1},
    ).sort("timestamp", -1).limit(500):
        loc = doc.get("location") or {}
        lat = safe_float(loc.get("lat") or loc.get("latitude"))
        lng = safe_float(loc.get("lon") or loc.get("longitude"))
        if lat == 0.0 and lng == 0.0:
            continue
        poaching.append({
            "id": safe_str(doc.get("id")),
            "lat": lat,
            "lng": lng,
            "status": safe_str(doc.get("status"), "Pending"),
            "confidence": safe_float(doc.get("confidence")),
            "imageUrl": doc.get("imageUrl"),
            "timestamp": safe_str(doc.get("timestamp")),
        })

    # ── Fire hotspots ──────────────────────────────────────────────────────
    fire = []
    async for doc in db[FIRE_COLLECTION].find(
        {},
        {"_id": 1, "riskLevel": 1, "probability": 1,
         "timestamp": 1, "location": 1},
    ).sort("timestamp", -1).limit(500):
        loc = doc.get("location") or {}
        lat = safe_float(loc.get("lat") or loc.get("latitude"))
        lng = safe_float(loc.get("lon") or loc.get("longitude"))
        if lat == 0.0 and lng == 0.0:
            continue
        fire.append({
            "id": str(doc.get("_id", "")),
            "lat": lat,
            "lng": lng,
            "riskLevel": safe_str(doc.get("riskLevel"), "Low"),
            "probability": safe_float(doc.get("probability")),
            "timestamp": safe_str(doc.get("timestamp")),
        })

    return {"wildlife": wildlife, "poaching": poaching, "fire": fire}
