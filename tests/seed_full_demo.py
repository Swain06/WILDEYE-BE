import os
import sys
import uuid
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import random

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

async def seed_full_demo():
    uri = "mongodb://wildeye:password123@127.0.0.1:27017/wildeye?authSource=wildeye"
    client = AsyncIOMotorClient(uri)
    db = client["wildeye"]
    
    # Collections
    wildlife_col = db["detections"]
    poaching_col = db["poaching_alerts"]
    fire_col = db["fire_hotspots"]
    
    # Clean up previous DEMO data
    await wildlife_col.delete_many({"location.name": {"$regex": "Demo"}})
    await poaching_col.delete_many({"location.name": {"$regex": "Demo"}})
    await fire_col.delete_many({"location.name": {"$regex": "Demo"}})
    
    parks = [
        {"name": "Demo-Jim Corbett (NW)", "lat": 29.53, "lon": 78.77},
        {"name": "Demo-Kaziranga (NE)", "lat": 26.58, "lon": 93.17},
        {"name": "Demo-Gir (W)", "lat": 21.12, "lon": 70.82},
        {"name": "Demo-Periyar (S)", "lat": 9.46, "lon": 77.24},
        {"name": "Demo-Hemis (N)", "lat": 33.99, "lon": 77.42},
        {"name": "Demo-Sundarbans (E)", "lat": 21.94, "lon": 88.75},
        {"name": "Demo-Ranthambore (NW)", "lat": 26.01, "lon": 76.50},
        {"name": "Demo-Bandipur (S)", "lat": 11.66, "lon": 76.62},
        {"name": "Demo-Pench (C)", "lat": 21.46, "lon": 79.28},
        {"name": "Demo-Kanha (C)", "lat": 22.33, "lon": 80.61},
        {"name": "Demo-Sariska (NW)", "lat": 27.32, "lon": 76.43},
        {"name": "Demo-Tadoba (C)", "lat": 20.21, "lon": 79.31}
    ]
    
    base_time = datetime.utcnow()
    
    # 1. Seed Wildlife (100 items)
    wildlife_species = ["Elephant", "Tiger", "Leopard", "Cheetah", "Snow Leopard", "Rhino"]
    wildlife_data = []
    for _ in range(100):
        loc = random.choice(parks)
        # Add some jitter to spread them out around the park
        lat = loc["lat"] + random.uniform(-0.1, 0.1)
        lon = loc["lon"] + random.uniform(-0.1, 0.1)
        
        wildlife_data.append({
            "species": random.choice(wildlife_species),
            "confidence": round(random.uniform(70.0, 99.0), 1),
            "timestamp": base_time - timedelta(days=random.randint(0, 60), hours=random.randint(0, 23)),
            "location": {"name": loc["name"], "lat": lat, "lon": lon},
            "bbox": [100, 100, 200, 200],
            "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"
        })
    await wildlife_col.insert_many(wildlife_data)
    print(f"Seeded {len(wildlife_data)} Wildlife Detections")

    # 2. Seed Poaching (30 items)
    poaching_data = []
    for _ in range(30):
        loc = random.choice(parks)
        lat = loc["lat"] + random.uniform(-0.05, 0.05)
        lon = loc["lon"] + random.uniform(-0.05, 0.05)
        
        poaching_data.append({
            "id": str(uuid.uuid4()),
            "isSuspicious": True,
            "confidence": round(random.uniform(40.0, 95.0), 1),
            "alertSent": True,
            "detectedObjects": ["Person", "Rifle", "Trap"],
            "status": random.choice(["Pending", "Reviewed", "Confirmed"]),
            "timestamp": (base_time - timedelta(days=random.randint(0, 10))).isoformat() + "Z",
            "location": {"name": loc["name"], "lat": lat, "lon": lon},
            "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"
        })
    await poaching_col.insert_many(poaching_data)
    print(f"Seeded {len(poaching_data)} Poaching Alerts")

    # 3. Seed Forest Fires (25 items)
    fire_data = []
    for _ in range(25):
        # Fires more common in specific dry areas (Ranthambore, Gir, Sariska, Tadoba)
        dry_parks = [p for p in parks if "NW" in p["name"] or "(W)" in p["name"] or "(C)" in p["name"]]
        loc = random.choice(dry_parks)
        lat = loc["lat"] + random.uniform(-0.2, 0.2)
        lon = loc["lon"] + random.uniform(-0.2, 0.2)
        
        risk = random.choice(["Medium", "High", "Critical"])
        fire_data.append({
            "location": {"name": loc["name"], "lat": lat, "lon": lon},
            "riskLevel": risk,
            "probability": round(random.uniform(0.4, 0.98), 2),
            "timestamp": (base_time - timedelta(days=random.randint(0, 5))).isoformat() + "Z"
        })
    await fire_col.insert_many(fire_data)
    print(f"Seeded {len(fire_data)} Fire Hotspots")

    client.close()

if __name__ == "__main__":
    asyncio.run(seed_full_demo())
