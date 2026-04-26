import os
import sys
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

async def seed_migration_data():
    uri = "mongodb://wildeye:password123@127.0.0.1:27017/wildeye?authSource=wildeye"
    client = AsyncIOMotorClient(uri)
    db = client["wildeye"]
    collection = db["detections"]
    
    species = "Elephant"
    # Create a path moving from South West to North East over 5 days
    start_lat, start_lng = 29.50, 78.80
    
    # Clean up previous test data for this species
    await collection.delete_many({"species": species, "location.name": {"$regex": "Test-Track"}})
    
    detections = []
    base_time = datetime.utcnow() - timedelta(days=5)
    
    for i in range(10):
        # Move roughly 0.05 degrees (~5km) each step
        lat = start_lat + (i * 0.05)
        lng = start_lng + (i * 0.08)
        timestamp = base_time + timedelta(hours=12 * i)
        
        detections.append({
            "species": species,
            "confidence": 95.0,
            "timestamp": timestamp,
            "location": {
                "name": f"Test-Track-Cam-{i+1}",
                "lat": lat,
                "lon": lng
            },
            "bbox": [100, 100, 200, 200],
            "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg"
        })
    
    await collection.insert_many(detections)
    print(f"Seeded {len(detections)} test detections for {species}")
    
    # Now check the endpoint
    from backend.routers.detections import calculate_direction # test import
    print("Testing migration logic...")
    
    # We'll just run the script and then check the frontend or curl
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_migration_data())
