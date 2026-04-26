"""
Seed realistic lat/lng coordinates into existing wildlife detections and poaching alerts
that currently have lat=0, lon=0.

Run with:
  cd backend
  python seed_map_coords.py

Locations are spread across major Indian wildlife reserves.
"""
import asyncio
import random
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

# Realistic wildlife reserve locations in India
LOCATIONS = [
    {"name": "Jim Corbett NP", "lat": 29.53, "lon": 78.77},
    {"name": "Ranthambore NP", "lat": 26.02, "lon": 76.50},
    {"name": "Sundarbans", "lat": 21.95, "lon": 89.18},
    {"name": "Kanha NP", "lat": 22.33, "lon": 80.61},
    {"name": "Bandhavgarh NP", "lat": 23.72, "lon": 81.04},
    {"name": "Pench NP", "lat": 21.68, "lon": 79.29},
    {"name": "Kaziranga NP", "lat": 26.57, "lon": 93.17},
    {"name": "Nagarhole NP", "lat": 12.04, "lon": 76.13},
    {"name": "Periyar NP", "lat": 9.47, "lon": 77.17},
    {"name": "Tadoba NP", "lat": 20.23, "lon": 79.33},
    {"name": "Sariska TR", "lat": 27.32, "lon": 76.38},
    {"name": "Gir Forest NP", "lat": 21.13, "lon": 70.79},
]


def jitter(val: float, spread: float = 0.3) -> float:
    """Add a small random offset so markers don't all stack."""
    return round(val + random.uniform(-spread, spread), 6)


async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB]

    # ── Wildlife detections ─────────────────────────────────────────────
    det_cursor = db["detections"].find(
        {"$or": [{"location.lat": 0}, {"location.lat": {"$exists": False}}]}
    )
    det_updated = 0
    async for doc in det_cursor:
        loc = random.choice(LOCATIONS)
        await db["detections"].update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "location.lat": jitter(loc["lat"]),
                "location.lon": jitter(loc["lon"]),
                "location.name": loc["name"],
            }}
        )
        det_updated += 1
    print(f"Updated {det_updated} wildlife detections with coordinates")

    # ── Poaching alerts ─────────────────────────────────────────────────
    pa_cursor = db["poaching_alerts"].find(
        {"$or": [{"location.lat": 0}, {"location.lat": {"$exists": False}}]}
    )
    pa_updated = 0
    async for doc in pa_cursor:
        loc = random.choice(LOCATIONS)
        await db["poaching_alerts"].update_one(
            {"_id": doc["_id"]},
            {"$set": {
                "location.lat": jitter(loc["lat"]),
                "location.lon": jitter(loc["lon"]),
                "location.name": loc["name"],
            }}
        )
        pa_updated += 1
    print(f"Updated {pa_updated} poaching alerts with coordinates")

    client.close()
    print("Done! Refresh your Map View page.")


if __name__ == "__main__":
    asyncio.run(main())
