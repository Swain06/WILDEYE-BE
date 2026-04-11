import os
import sys
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import random

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

async def seed_diverse_data():
    uri = "mongodb://wildeye:password123@127.0.0.1:27017/wildeye?authSource=wildeye"
    client = AsyncIOMotorClient(uri)
    db = client["wildeye"]
    collection = db["detections"]
    
    # Clean up previous test data
    await collection.delete_many({"location.name": {"$regex": "Demo-Map"}})
    
    species_list = ["Tiger", "Elephant", "Leopard", "Cheetah", "Snow Leopard"]
    locations = [
        {"name": "Demo-Map-Jim Corbett", "lat": 29.53, "lon": 78.77},
        {"name": "Demo-Map-Kaziranga", "lat": 26.58, "lon": 93.17},
        {"name": "Demo-Map-Gir National Park", "lat": 21.12, "lon": 70.82},
        {"name": "Demo-Map-Periyar", "lat": 9.46, "lon": 77.24},
        {"name": "Demo-Map-Hemis", "lat": 33.99, "lon": 77.42},
        {"name": "Demo-Map-Ranthambore", "lat": 26.01, "lon": 76.50},
        {"name": "Demo-Map-Sundarbans", "lat": 21.94, "lon": 88.75},
        {"name": "Demo-Map-Bandipur", "lat": 11.66, "lon": 76.62},
        {"name": "Demo-Map-Pench", "lat": 21.46, "lon": 79.28},
        {"name": "Demo-Map-Dachigam", "lat": 34.13, "lon": 75.03}
    ]
    
    detections = []
    base_time = datetime.utcnow()
    
    for species in species_list:
        # Create 5-8 random detections for each species across different parks
        num_dets = random.randint(5, 8)
        selected_locs = random.sample(locations, num_dets)
        
        for i, loc in enumerate(selected_locs):
            timestamp = base_time - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
            
            detections.append({
                "species": species,
                "confidence": round(random.uniform(75.0, 99.0), 1),
                "timestamp": timestamp,
                "location": loc,
                "bbox": [100, 100, 200, 200],
                "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"
            })
    
    if detections:
        await collection.insert_many(detections)
        print(f"Seeded {len(detections)} diverse detections across India")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_diverse_data())
