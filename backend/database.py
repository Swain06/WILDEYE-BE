"""MongoDB connection. Database is set on app.state in main lifespan."""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    return AsyncIOMotorClient(settings.MONGODB_URI)


def get_database(client: AsyncIOMotorClient | None = None) -> AsyncIOMotorDatabase:
    if client is not None:
        return client[settings.MONGODB_DB]
    global _db
    if _db is None:
        _db = get_mongo_client()[settings.MONGODB_DB]
    return _db
