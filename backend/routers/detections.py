"""Wildlife detection API: upload image, run YOLO, list/export history from MongoDB."""

import csv
import io
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from detection.cloudinary_uploader import upload_image_bytes
from detection import run_detection
from detection.schemas import Detection, Location, WildlifeDetectionResult, MigrationResponse, MigrationPoint, MigrationInsights
from detection.lstm_predictor import predict_next_position
from detection.gradcam import generate_gradcam
from detection.ensemble import ensemble_predict, EnsembleResult
from detection.preprocessing import preprocess_thermal, preprocess_nightvision
import tempfile
import os
import math


def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in km."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * \
        math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def calculate_direction(lat1, lon1, lat2, lon2):
    """Determine compass direction between two points."""
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    angle = math.degrees(math.atan2(dlon, dlat)) % 360  # 0 is North

    if 22.5 <= angle < 67.5: return "North-East"
    if 67.5 <= angle < 112.5: return "East"
    if 112.5 <= angle < 157.5: return "South-East"
    if 157.5 <= angle < 202.5: return "South"
    if 202.5 <= angle < 247.5: return "South-West"
    if 247.5 <= angle < 292.5: return "West"
    if 292.5 <= angle < 337.5: return "North-West"
    return "North"


def get_active_period(hour: int) -> str:
    """Map hour to human readable period."""
    if 4 <= hour <= 6: return "Early morning (4am - 6am)"
    if 7 <= hour <= 11: return "Morning (7am - 11am)"
    if 12 <= hour <= 16: return "Afternoon (12pm - 4pm)"
    if 17 <= hour <= 20: return "Evening (5pm - 8pm)"
    return "Night (9pm - 3am)"

router = APIRouter(prefix="/api/detections", tags=["Wildlife Detection"])

COLLECTION = "detections"


def get_db(request: Request) -> AsyncIOMotorDatabase:
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


@router.post("", response_model=WildlifeDetectionResult)
async def create_detections(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    image: Annotated[UploadFile, File(description="Camera trap image")],
    location_name: Annotated[str | None, Form()] = None,
    lat: Annotated[float | None, Form()] = None,
    lon: Annotated[float | None, Form()] = None,
    mode: Annotated[str, Query()] = "normal",
):
    """Upload an image, run wildlife detection (YOLO), save detections to MongoDB, return result."""
    location = Location(
        lat=lat if lat is not None else 0.0,
        lon=lon if lon is not None else 0.0,
        name=location_name or "Unknown",
    )
    contents = await image.read()

    # Original image URL
    image_url = upload_image_bytes(contents, folder="wildeye/wildlife")

    enhanced_image_url = None
    process_contents = contents

    if mode in ["thermal", "night"]:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            tmp.write(contents)
            input_path = tmp.name

        output_path = input_path.replace(".jpg", "_enhanced.jpg")

        try:
            if mode == "thermal":
                preprocess_thermal(input_path, output_path)
            elif mode == "night":
                preprocess_nightvision(input_path, output_path)

            if os.path.exists(output_path):
                with open(output_path, "rb") as f:
                    enhanced_contents = f.read()
                    enhanced_image_url = upload_image_bytes(enhanced_contents, folder="wildeye/enhanced")
                    process_contents = enhanced_contents
        finally:
            if os.path.exists(input_path):
                os.remove(input_path)
            if os.path.exists(output_path):
                os.remove(output_path)

    result = run_detection(image=process_contents, location=location)
    result.enhancedImageUrl = enhanced_image_url

    # Persist each detection
    for det in result.detections:
        det.imageUrl = image_url
        det.enhancedImageUrl = enhanced_image_url
        doc = det.model_dump()
        doc["bbox"] = list(doc["bbox"])  # tuple -> list for MongoDB
        await db[COLLECTION].insert_one(doc)

    return result


@router.post("/ensemble", response_model=EnsembleResult)
async def create_ensemble_detections(
    image: Annotated[UploadFile, File(description="Camera trap image")],
    location_name: Annotated[str | None, Form()] = None,
    lat: Annotated[float | None, Form()] = None,
    lon: Annotated[float | None, Form()] = None,
):
    """Run the same image through all ensemble models (~3) and return aggregated results.
    Results are NOT persisted to MongoDB (ensemble runs are ephemeral).
    """
    location = Location(
        lat=lat if lat is not None else 0.0,
        lon=lon if lon is not None else 0.0,
        name=location_name or "Unknown",
    )
    contents = await image.read()
    try:
        result = ensemble_predict(image=contents, location=location)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ensemble detection failed: {exc}")
    return result


@router.get("", response_model=dict)
async def list_detections(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    species: Annotated[str | None, Query(description="Filter by species; use 'All' or omit for no filter")] = None,
    search: Annotated[str | None, Query(description="Search in location name and species")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """List detection history with optional species and text search, paginated."""
    filter_query: dict = {}
    if species and species != "All":
        filter_query["species"] = species
    if search and search.strip():
        strip = search.strip()
        filter_query["$or"] = [
            {"location.name": {"$regex": strip, "$options": "i"}},
            {"species": {"$regex": strip, "$options": "i"}},
        ]

    cursor = db[COLLECTION].find(filter_query).sort("timestamp", -1).skip(offset).limit(limit)
    total = await db[COLLECTION].count_documents(filter_query)
    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id", ""))
        # Handle datetime timestamp from MongoDB
        ts = doc.get("timestamp")
        if isinstance(ts, datetime):
            doc["timestamp"] = ts.isoformat()
        else:
            doc["timestamp"] = str(ts) if ts else ""

        doc["bbox"] = tuple(doc["bbox"]) if isinstance(doc.get("bbox"), list) else doc.get("bbox")
        items.append(Detection(**doc))

    return {"items": items, "total": total}


@router.get("/export")
async def export_detections_csv(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    species: Annotated[str | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 2000,
):
    """Export filtered detections as CSV."""
    filter_query: dict = {}
    if species and species != "All":
        filter_query["species"] = species
    if search and search.strip():
        strip = search.strip()
        filter_query["$or"] = [
            {"location.name": {"$regex": strip, "$options": "i"}},
            {"species": {"$regex": strip, "$options": "i"}},
        ]

    cursor = db[COLLECTION].find(filter_query).sort("timestamp", -1).limit(limit)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["ID", "Species", "Confidence", "Timestamp", "Location"])

    async for doc in cursor:
        loc = doc.get("location") or {}
        # Ensure ID and Timestamp are strings for CSV
        doc_id = str(doc.get("_id", ""))
        ts = doc.get("timestamp", "")
        if isinstance(ts, datetime):
            ts = ts.strftime('%Y-%m-%d %H:%M:%S')

        writer.writerow([
            doc_id,
            doc.get("species", ""),
            f"{doc.get('confidence', 0):.1f}%",
            ts,
            loc.get("name", ""),
        ])

    filename = f"wildlife_detections_{datetime.utcnow().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        io.BytesIO(buffer.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/explain/{detection_id}")
async def explain_detection(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    detection_id: str,
):
    """Run Grad-CAM on the stored image for a given detection and return the heatmap."""
    doc = await db[COLLECTION].find_one({"id": detection_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Detection not found")

    image_url: str | None = doc.get("imageUrl")
    if not image_url:
        raise HTTPException(
            status_code=422,
            detail="Image not available for this detection. Only detections with a stored image URL can be explained.",
        )

    species: str = doc.get("species", "wildlife")

    try:
        result = generate_gradcam(image_url=image_url, species=species)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Grad-CAM failed: {exc}")

    return result


@router.get("/{detection_id}", response_model=Detection)
async def get_detection(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    detection_id: str,
):
    """Get a single detection by ID."""
    doc = await db[COLLECTION].find_one({"id": detection_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Detection not found")
    doc.pop("_id", None)
    doc["bbox"] = tuple(doc["bbox"]) if isinstance(doc.get("bbox"), list) else doc.get("bbox")
    return Detection(**doc)


@router.get("/predict-movement/{species}")
async def get_movement_prediction(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    species: str,
):
    """Fetch last 10 detections of the given species and run movement prediction."""
    cursor = db[COLLECTION].find({"species": species}).sort("timestamp", -1).limit(10)
    history = []
    async for doc in cursor:
        doc.pop("_id", None)
        # Ensure bbox is a list for the API response
        doc["bbox"] = list(doc["bbox"]) if isinstance(doc.get("bbox"), list) else doc.get("bbox")
        history.append(doc)

    if not history:
        return {
            "species": species,
            "prediction": None,
            "message": f"No detections found for species: {species}"
        }

    # predict_next_position expects history in chronological order (oldest first)
    chronological_history = list(reversed(history))
    prediction = predict_next_position(chronological_history)

    if prediction is None:
        return {
            "species": species,
            "history": history,
            "prediction": None,
            "message": "Not enough detection history for this species (need at least 3)"
        }

    return {
        "species": species,
        "history": history,
        "prediction": prediction
    }


@router.get("/migration/{species}", response_model=MigrationResponse)
async def get_migration_corridor(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    species: str,
):
    """Fetch all detections for a species, calculate migration corridor and insights."""
    cursor = db[COLLECTION].find({"species": species}).sort("timestamp", 1)
    detections = []
    async for doc in cursor:
        detections.append(doc)

    if not detections:
        return MigrationResponse(
            species=species,
            total_sightings=0,
            corridor=[],
            insights=MigrationInsights(
                dominant_direction="N/A",
                avg_speed_kmph=0.0,
                most_active_hour=0,
                most_active_period="No data",
                estimated_range_km2=0.0
            )
        )

    # Build corridor
    corridor = []
    seq_counter = 1
    for i, d in enumerate(detections):
        loc = d["location"]
        # Skip invalid coords (0,0) for corridor visualization
        if loc.get("lat") == 0 and loc.get("lon") == 0:
            continue
            
        ts = d["timestamp"]
        if isinstance(ts, datetime):
            ts_str = ts.isoformat()
        else:
            ts_str = str(ts)
            
        corridor.append(MigrationPoint(
            lat=loc["lat"],
            lng=loc["lon"],
            timestamp=ts_str,
            sequence=seq_counter
        ))
        seq_counter += 1

    # Calculate insights
    total_dist = 0.0
    total_time_diff = 0.0
    directions = []
    hours = []

    min_lat, max_lat = detections[0]["location"]["lat"], detections[0]["location"]["lat"]
    min_lon, max_lon = detections[0]["location"]["lon"], detections[0]["location"]["lon"]

    for i in range(len(detections)):
        curr = detections[i]
        loc = curr["location"]
        # Skip invalid coords (0,0) for range/insights
        if loc["lat"] == 0 and loc["lon"] == 0:
            continue
            
        # Track bounds for range
        if min_lat == 0 and min_lon == 0: # reset if start was 0,0
            min_lat, max_lat = loc["lat"], loc["lat"]
            min_lon, max_lon = loc["lon"], loc["lon"]
        else:
            min_lat = min(min_lat, loc["lat"])
            max_lat = max(max_lat, loc["lat"])
            min_lon = min(min_lon, loc["lon"])
            max_lon = max(max_lon, loc["lon"])
        
        # Hour for clustering
        try:
            ts = curr["timestamp"]
            if isinstance(ts, datetime):
                dt = ts
            else:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            hours.append(dt.hour)
        except:
            pass

        if i > 0:
            prev = detections[i-1]
            p_loc = prev["location"]
            
            # Distance and time
            dist = haversine(p_loc["lat"], p_loc["lon"], loc["lat"], loc["lon"])
            total_dist += dist
            
            try:
                ts_prev = prev["timestamp"]
                ts_curr = curr["timestamp"]
                
                t1 = ts_prev if isinstance(ts_prev, datetime) else datetime.fromisoformat(ts_prev.replace("Z", "+00:00"))
                t2 = ts_curr if isinstance(ts_curr, datetime) else datetime.fromisoformat(ts_curr.replace("Z", "+00:00"))
                
                diff = (t2 - t1).total_seconds() / 3600.0 # hours
                if diff > 0:
                    total_time_diff += diff
            except:
                pass
            
            # Direction
            directions.append(calculate_direction(p_loc["lat"], p_loc["lon"], loc["lat"], loc["lon"]))

    # Aggregates
    avg_speed = (total_dist / total_time_diff) if total_time_diff > 0 else 0.0
    
    # Dominant direction
    if directions:
        dominant_direction = max(set(directions), key=directions.count)
    else:
        dominant_direction = "Stationary"
        
    # Most active hour
    if hours:
        most_active_hour = max(set(hours), key=hours.count)
    else:
        most_active_hour = 0
    
    # Estimated range (Bounding box area approx)
    # 1 deg lat approx 111km, 1 deg lon at equator approx 111km
    lat_dist = (max_lat - min_lat) * 111
    lon_dist = (max_lon - min_lon) * 111 * math.cos(math.radians(min_lat))
    range_km2 = abs(lat_dist * lon_dist)

    return MigrationResponse(
        species=species,
        total_sightings=len(detections),
        corridor=corridor,
        insights=MigrationInsights(
            dominant_direction=dominant_direction,
            avg_speed_kmph=round(avg_speed, 2),
            most_active_hour=most_active_hour,
            most_active_period=get_active_period(most_active_hour),
            estimated_range_km2=round(range_km2, 2)
        )
    )
