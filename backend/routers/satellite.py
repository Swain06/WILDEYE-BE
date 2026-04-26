from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta, timezone
from typing import Optional
import asyncio

from services.nasa_firms import fetch_active_fires, classify_fire_severity
from services.carbon_estimator import estimate_emissions
from database import get_database
from config import settings
from pydantic import BaseModel

router = APIRouter(prefix="/api/satellite", tags=["Satellite Fire Detection"])

# Module-level cache
_cache = {
    "fires": [],
    "last_updated": None
}

async def get_cached_fires():
    now = datetime.now(timezone.utc)
    refresh_interval = settings.FIRMS_REFRESH_INTERVAL
    
    if _cache["last_updated"] is None or (now - _cache["last_updated"]) > timedelta(minutes=refresh_interval):
        fires = await fetch_active_fires(days=1)
        # Classify severity and add placeholder carbon estimate
        for fire in fires:
            fire["severity"] = classify_fire_severity(fire["frp"], fire["brightness"], fire["confidence"])
            # Placeholder Carbon Estimate: 1.6 * FRP (very rough proxy)
            fire["carbon_emissions"] = round(fire["frp"] * 1.6, 2)
        
        _cache["fires"] = fires
        _cache["last_updated"] = now
        
    return _cache["fires"], _cache["last_updated"]

@router.get("/fires")
async def get_fires():
    """Get real-time active fire detections."""
    fires, last_updated = await get_cached_fires()
    return {
        "fires": fires,
        "total": len(fires),
        "last_updated": last_updated.isoformat() if last_updated else None,
        "source": "NASA FIRMS (VIIRS + MODIS)",
        "bbox": settings.FIRMS_BBOX
    }

@router.get("/fires/summary")
async def get_fires_summary():
    """Get aggregate stats for the fire dashboard."""
    fires, last_updated = await get_cached_fires()
    
    by_severity = {"Extreme": 0, "Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    hottest_fire = {"lat": 0, "lng": 0, "frp": 0, "brightness": 0}
    
    for fire in fires:
        by_severity[fire["severity"]] = by_severity.get(fire["severity"], 0) + 1
        if fire["frp"] > hottest_fire["frp"]:
            hottest_fire = {
                "lat": fire["lat"],
                "lng": fire["lng"],
                "frp": fire["frp"],
                "brightness": fire["brightness"]
            }
            
    return {
        "total_fires": len(fires),
        "by_severity": by_severity,
        "hottest_fire": hottest_fire if len(fires) > 0 else None,
        "most_active_region": "India Monitoring Zone", # BBOX generic name
        "last_updated": last_updated.isoformat() if last_updated else None
    }

@router.get("/fires/history")
async def get_fires_history(days: int = Query(7, ge=1, le=7)):
    """Get historical fire trends for the last N days."""
    # Note: FIRMS API allows fetching up to 7 days in one go
    historical_fires = await fetch_active_fires(days=days)
    
    history_map = {}
    for fire in historical_fires:
        date_str = fire["acq_date"]
        if date_str not in history_map:
            history_map[date_str] = {"date": date_str, "count": 0, "total_frp": 0}
        history_map[date_str]["count"] += 1
        history_map[date_str]["total_frp"] += fire["frp"]
        
    history = []
    for date_str in sorted(history_map.keys()):
        item = history_map[date_str]
        history.append({
            "date": item["date"],
            "count": item["count"],
            "avg_frp": round(item["total_frp"] / item["count"], 2) if item["count"] > 0 else 0
        })
        

class CarbonEstimateRequest(BaseModel):
    burned_area_ha: float = 0
    forest_type: str = "default"
    frp_mw: Optional[float] = None
    duration_hours: float = 6
    lat: float
    lng: float
    fire_date: str

@router.post("/carbon-estimate")
async def create_carbon_estimate(req: CarbonEstimateRequest):
    """Estimate and save carbon emissions for a fire event."""
    estimate = estimate_emissions(
        burned_area_ha=req.burned_area_ha,
        forest_type=req.forest_type,
        frp_mw=req.frp_mw,
        duration_hours=req.duration_hours
    )
    
    # Add metadata
    estimate["lat"] = req.lat
    estimate["lng"] = req.lng
    estimate["fire_date"] = req.fire_date
    estimate["created_at"] = datetime.now(timezone.utc).isoformat()
    
    # Save to MongoDB
    db = get_database()
    await db.carbon_estimates.insert_one(estimate)
    
    # Remove MongoDB _id before returning
    if "_id" in estimate:
        estimate["id"] = str(estimate["_id"])
        del estimate["_id"]
        
    return estimate

@router.get("/carbon-estimates")
async def list_carbon_estimates():
    """Retrieve all saved carbon estimates."""
    db = get_database()
    cursor = db.carbon_estimates.find().sort("created_at", -1)
    estimates = await cursor.to_list(length=100)
    
    total_co2_eq = 0
    for est in estimates:
        est["id"] = str(est["_id"])
        del est["_id"]
        total_co2_eq += est["emissions"]["co2_equivalent"]
        
    return {
        "estimates": estimates,
        "total_co2_equivalent": round(total_co2_eq, 2),
        "count": len(estimates)
    }
