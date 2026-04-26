import asyncio
import uuid
import random
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

# Collection names
DETECTIONS_COL = "detections"
POACHING_COL = "poaching_alerts"
FIRE_COL = "fire_hotspots"

# Species list
SPECIES = [
    "Tiger", "Elephant", "Lion", "Leopard", "Cheetah", 
    "Bear", "Deer", "Monkey", "Panda", "Giraffe", "Zebra"
]

# Locations
LOCATIONS = [
    {"name": "North Trail Cam 1", "lat": 29.53, "lon": 78.77},
    {"name": "South Water Hole", "lat": 29.50, "lon": 78.80},
    {"name": "East Ridge", "lat": 29.55, "lon": 78.85},
    {"name": "West Valley", "lat": 29.52, "lon": 78.70},
    {"name": "Central Forest", "lat": 29.54, "lon": 78.75},
]

async def seed_data():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB]

    print(f"Seeding realistic data to database: {settings.MONGODB_DB}...")

    # 1. Clear existing data to ensure a clean state
    await db[DETECTIONS_COL].delete_many({})
    await db[POACHING_COL].delete_many({})
    await db[FIRE_COL].delete_many({})

    # 2. Seed Wildlife Detections with Movement Patterns
    detections = []
    now = datetime.now(timezone.utc)
    
    for species in ["Tiger", "Elephant", "Leopard"]:
        x, y = 0.2, 0.8
        for i in range(10):
            x += random.uniform(0.02, 0.05)
            y -= random.uniform(0.02, 0.05)
            w, h = 0.2, 0.3
            x1, y1, x2, y2 = x - w/2, y - h/2, x + w/2, y + h/2
            
            # Format: YYYY-MM-DDTHH:MM:SSZ
            ts = (now - timedelta(minutes=10 * (10 - i))).strftime("%Y-%m-%dT%H:%M:%SZ")
            loc = random.choice(LOCATIONS)
            
            detections.append({
                "id": str(uuid.uuid4()),
                "species": species,
                "confidence": random.uniform(85, 98),
                "bbox": [x1, y1, x2, y2],
                "timestamp": ts,
                "location": loc,
                "imageUrl": "https://res.cloudinary.com/demo/image/upload/sample.jpg"
            })

    # Add 50 more random detections
    for _ in range(50):
        species = random.choice(SPECIES)
        ts = (now - timedelta(days=random.randint(0, 180))).strftime("%Y-%m-%dT%H:%M:%SZ")
        loc = random.choice(LOCATIONS)
        detections.append({
            "id": str(uuid.uuid4()),
            "species": species,
            "confidence": random.uniform(40, 95),
            "bbox": [random.uniform(0, 0.8), random.uniform(0, 0.8), random.uniform(0.1, 0.9), random.uniform(0.1, 0.9)],
            "timestamp": ts,
            "location": loc
        })
    
    if detections:
        await db[DETECTIONS_COL].insert_many(detections)
        print(f"✓ Inserted {len(detections)} wildlife detections")

    # 3. Seed Poaching Alerts
    poaching_alerts = []
    for i in range(20):
        is_suspicious = random.choice([True, True, False])
        ts = (now - timedelta(days=random.randint(0, 180))).strftime("%Y-%m-%dT%H:%M:%SZ")
        loc = random.choice(LOCATIONS)
        status = random.choice(["Pending", "Reviewed", "Confirmed", "False Positive"])
        objects = random.sample(["person", "gun", "truck", "trap"], random.randint(1, 3)) if is_suspicious else []
            
        poaching_alerts.append({
            "id": str(uuid.uuid4()),
            "isSuspicious": is_suspicious,
            "confidence": random.uniform(60, 99) if is_suspicious else 0.0,
            "alertSent": is_suspicious,
            "detectedObjects": objects,
            "status": status,
            "timestamp": ts,
            "location": loc,
            "imageUrl": "https://res.cloudinary.com/demo/image/upload/sample.jpg"
        })
        
    if poaching_alerts:
        await db[POACHING_COL].insert_many(poaching_alerts)
        print(f"✓ Inserted {len(poaching_alerts)} poaching alerts")

    # 4. Seed Fire Hotspots
    fire_hotspots = []
    for i in range(15):
        ts = (now - timedelta(days=random.randint(0, 180))).strftime("%Y-%m-%dT%H:%M:%SZ")
        loc = random.choice(LOCATIONS)
        prob = random.uniform(0.1, 0.95)
        
        if prob >= 0.75: risk = "Critical"
        elif prob >= 0.5: risk = "High"
        elif prob >= 0.3: risk = "Medium"
        else: risk = "Low"
        
        fire_hotspots.append({
            "location": loc,
            "riskLevel": risk,
            "probability": prob,
            "timestamp": ts
        })
        
    if fire_hotspots:
        await db[FIRE_COL].insert_many(fire_hotspots)
        print(f"✓ Inserted {len(fire_hotspots)} fire hotspots")

    print("\nSeeding complete!")

if __name__ == "__main__":
    asyncio.run(seed_data())
