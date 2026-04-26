import os
import sys
import uuid
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import random

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

async def seed_realistic_demo():
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
    
    # Habitat Map (Species -> Preferred National Parks)
    habitats = {
        "Tiger": [
            {"name": "Demo-Ranthambore (NW)", "lat": 26.01, "lon": 76.50},
            {"name": "Demo-Jim Corbett (NW)", "lat": 29.53, "lon": 78.77},
            {"name": "Demo-Bandhavgarh (C)", "lat": 23.68, "lon": 81.02}
        ],
        "Elephant": [
            {"name": "Demo-Periyar (S)", "lat": 9.46, "lon": 77.24},
            {"name": "Demo-Bandipur (S)", "lat": 11.66, "lon": 76.62},
            {"name": "Demo-Kaziranga (NE)", "lat": 26.58, "lon": 93.17}
        ],
        "Snow Leopard": [
            {"name": "Demo-Hemis (N)", "lat": 33.99, "lon": 77.42},
            {"name": "Demo-Dachigam (N)", "lat": 34.13, "lon": 75.03}
        ],
        "Gir Lion": [
            {"name": "Demo-Gir (W)", "lat": 21.12, "lon": 70.82}
        ],
        "Rhino": [
            {"name": "Demo-Kaziranga (NE)", "lat": 26.58, "lon": 93.17}
        ],
        "Cheetah": [
            {"name": "Demo-Kuno (C)", "lat": 25.48, "lon": 77.30}
        ]
    }
    
    base_time = datetime.utcnow()
    
    # 1. Seed Wildlife (Localized for groups)
    wildlife_data = []
    for species, parks in habitats.items():
        # For EACH species, we create a few "groups" to show realistic movement
        for park in parks:
            # Create a localized "sequence" of detections for this species in this park
            num_points = random.randint(5, 12)
            # Start point
            c_lat = park["lat"]
            c_lon = park["lon"]
            
            for i in range(num_points):
                # Movement simulation: small walk within a 20km area
                c_lat += random.uniform(-0.02, 0.02)
                c_lon += random.uniform(-0.02, 0.02)
                
                timestamp = base_time - timedelta(days=(num_points - i) * 2, hours=random.randint(0, 5))
                
                wildlife_data.append({
                    "species": species,
                    "confidence": round(random.uniform(80.0, 99.0), 1),
                    "timestamp": timestamp,
                    "location": {"name": park["name"], "lat": c_lat, "lon": c_lon},
                    "bbox": [100, 100, 200, 200],
                    "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"
                })
    
    if wildlife_data:
        await wildlife_col.insert_many(wildlife_data)
        print(f"Seeded {len(wildlife_data)} Habitat-Realistic Wildlife Detections")

    # 2. Seed Poaching (Localized near parks)
    poaching_data = []
    all_parks = [p for sublist in habitats.values() for p in sublist]
    for _ in range(30):
        loc = random.choice(all_parks)
        lat = loc["lat"] + random.uniform(-0.05, 0.05)
        lon = loc["lon"] + random.uniform(-0.05, 0.05)
        
        poaching_data.append({
            "id": str(uuid.uuid4()),
            "isSuspicious": True,
            "confidence": round(random.uniform(40.0, 95.0), 1),
            "alertSent": True,
            "detectedObjects": ["Person", "Night Sight", "Illegal Trap"],
            "status": random.choice(["Pending", "Reviewed", "Confirmed"]),
            "timestamp": (base_time - timedelta(days=random.randint(0, 10))).isoformat() + "Z",
            "location": {"name": loc["name"], "lat": lat, "lon": lon},
            "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"
        })
    if poaching_data:
        await poaching_col.insert_many(poaching_data)
        print(f"Seeded {len(poaching_data)} Poaching Alerts")

    # 3. Seed Forest Fires (Localized in dry zones)
    fire_data = []
    dry_locations = [
        {"name": "Demo-Thar Desert (W)", "lat": 26.27, "lon": 73.02},
        {"name": "Demo-Central Plateau (C)", "lat": 23.25, "lon": 77.41},
        {"name": "Demo-Dry Forest (NW)", "lat": 27.0, "lon": 76.0},
        # Maharashtra spots
        {"name": "Demo-Tadoba (MH)", "lat": 20.23, "lon": 79.33},
        {"name": "Demo-Sahyadri TR (MH)", "lat": 17.37, "lon": 73.74},
        {"name": "Demo-Melghat TR (MH)", "lat": 21.43, "lon": 77.22},
        # South sites
        {"name": "Demo-Bandipur (S)", "lat": 11.66, "lon": 76.62},
        {"name": "Demo-Nagarhole (S)", "lat": 12.04, "lon": 76.13},
        {"name": "Demo-Periyar (S)", "lat": 9.47, "lon": 77.17},
        {"name": "Demo-Sathyamangalam (S)", "lat": 11.50, "lon": 77.20}
    ]
    for _ in range(45):
        loc = random.choice(dry_locations)
        lat = loc["lat"] + random.uniform(-0.5, 0.5)
        lon = loc["lon"] + random.uniform(-0.5, 0.5)
        
        risk = random.choice(["High", "Critical"])
        fire_data.append({
            "location": {"name": loc["name"], "lat": lat, "lon": lon},
            "riskLevel": risk,
            "probability": round(random.uniform(0.6, 0.98), 2),
            "timestamp": (base_time - timedelta(days=random.randint(0, 3))).isoformat() + "Z"
        })
    if fire_data:
        await fire_col.insert_many(fire_data)
        print(f"Seeded {len(fire_data)} Realistic Fire Hotspots")

    client.close()

if __name__ == "__main__":
    asyncio.run(seed_realistic_demo())
