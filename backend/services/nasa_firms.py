import httpx
import csv
import io
import os
from datetime import datetime, timedelta
from config import settings

NASA_FIRMS_KEY = settings.NASA_FIRMS_API_KEY
BBOX = settings.FIRMS_BBOX

FIRMS_SOURCES = ["VIIRS_SNPP_NRT", "MODIS_NRT"]

async def fetch_active_fires(days: int = 1) -> list[dict]:
    """
    Fetch active fire detections from NASA FIRMS for the last N days.
    Returns a list of fire points with lat, lng, brightness, confidence, satellite.
    """
    if not NASA_FIRMS_KEY:
        return []

    fires = []
    async with httpx.AsyncClient(timeout=30) as client:
        for source in FIRMS_SOURCES:
            url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_KEY}/{source}/{BBOX}/{days}"
            try:
                response = await client.get(url)
                if response.status_code != 200:
                    continue
                reader = csv.DictReader(io.StringIO(response.text))
                for row in reader:
                    try:
                        fires.append({
                            "lat": float(row.get("latitude", 0)),
                            "lng": float(row.get("longitude", 0)),
                            "brightness": float(row.get("bright_ti4") or row.get("brightness", 0)),
                            "confidence": row.get("confidence", "nominal"),
                            "satellite": row.get("satellite", source),
                            "acq_date": row.get("acq_date", ""),
                            "acq_time": row.get("acq_time", ""),
                            "frp": float(row.get("frp", 0)),  # Fire Radiative Power in MW
                            "daynight": row.get("daynight", "D"),
                            "source": source
                        })
                    except (ValueError, KeyError):
                        continue
            except Exception as e:
                print(f"[WildEye] FIRMS fetch failed for {source}: {e}")

    # Deduplicate by proximity (within 0.01 degrees)
    deduplicated = []
    for fire in fires:
        is_duplicate = False
        for existing in deduplicated:
            if abs(fire["lat"] - existing["lat"]) < 0.01 and abs(fire["lng"] - existing["lng"]) < 0.01:
                is_duplicate = True
                break
        if not is_duplicate:
            deduplicated.append(fire)

    return deduplicated


def classify_fire_severity(frp: float, brightness: float, confidence: str) -> str:
    """
    Classify fire severity based on Fire Radiative Power (FRP) and brightness.
    FRP is in megawatts — higher = more intense fire.
    """
    conf_score = {"low": 0, "nominal": 1, "high": 2, "n": 0, "l": 0, "h": 2}.get(
        str(confidence).lower(), 1
    )
    if frp > 500 or brightness > 400:
        return "Extreme"
    elif frp > 100 or brightness > 350:
        return "Critical"
    elif frp > 20 or brightness > 320:
        return "High"
    elif frp > 5 or brightness > 300:
        return "Medium"
    else:
        return "Low"
