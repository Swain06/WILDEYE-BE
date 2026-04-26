import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()  # Load .env before anything else reads os.getenv()

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient

from config import settings
from routers import analytics, chat, detections, fire, habitat, map as map_router, models, news, poaching, satellite

# Path to the compiled React frontend (built by Docker stage 1)
FRONTEND_DIST = Path("/app/frontend/dist")


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

# Read allowed origins from settings; allow all when running on HF Spaces
raw_origins = settings.ALLOWED_ORIGINS.strip()
if raw_origins == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
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


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Serve the compiled React SPA ───────────────────────────────────────────────
# Mount static assets (js/css/images) only when the dist folder exists
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(FRONTEND_DIST / "index.html")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: serve static file if it exists, otherwise serve index.html
        so that React Router's client-side routes work correctly."""
        target = FRONTEND_DIST / full_path
        if target.exists() and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    # Fallback when running locally without a frontend build
    @app.get("/")
    async def root():
        return {"message": "WildEye API is running. Frontend not found at /app/frontend/dist."}
