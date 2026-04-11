import os
import asyncio
from dotenv import load_dotenv
load_dotenv()  # Load .env before anything else reads os.getenv()

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from config import settings
from routers import analytics, chat, detections, fire, habitat, map as map_router, models, news, poaching, satellite


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect to MongoDB on startup, close on shutdown."""
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    app.state.db = client[settings.MONGODB_DB]
    
    # Start background task for NASA FIRMS data refresh
    asyncio.create_task(refresh_firms_data_task())
    
    yield
    client.close()


async def refresh_firms_data_task():
    """Background task to periodically refresh NASA FIRMS fire data."""
    print("[WildEye] Starting NASA FIRMS background refresh task...")
    while True:
        try:
            # Trigger a refresh by calling get_cached_fires (which handles the fetch/cache logic)
            from routers.satellite import get_cached_fires
            fires, _ = await get_cached_fires()
            print(f"[WildEye] NASA FIRMS data refreshed — {len(fires)} active fires detected.")
        except Exception as e:
            print(f"[WildEye] Background FIRMS refresh failed: {e}")
        
        # Wait for the interval (converted to seconds)
        await asyncio.sleep(settings.FIRMS_REFRESH_INTERVAL * 60)


app = FastAPI(title="WildEye API", version="0.1.0", lifespan=lifespan)

# Bug 3 fix: read allowed origins from settings (which loads from .env)
# Split by comma and strip any whitespace around URLs
allowed_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(detections.router)
app.include_router(poaching.router)
app.include_router(fire.router)
app.include_router(habitat.router)
app.include_router(map_router.router)
app.include_router(analytics.router)
app.include_router(chat.router)
app.include_router(news.router)
app.include_router(models.router)
app.include_router(satellite.router)


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/health")
async def health():
    return {"status": "ok"}
