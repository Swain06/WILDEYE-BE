"""Load settings from .env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # MongoDB
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "wildeye"

    # Model paths (under backend/ or absolute)
    WILDLIFE_MODEL_PATH: str = "trained_models/WildlifeDetection.pt"
    POACHING_MODEL_PATH: str = "trained_models/PoachingDetection.pt"
    WILDFIRE_MODEL_PATH: str = "trained_models/WildfirePrediction.pth"
    FIRE_MODEL_PATH: str = "trained_models/fire_model.joblib"
    FIRE_SCALER_PATH: str = "trained_models/fire_scaler.joblib"
    HABITAT_MODEL_PATH: str = "trained_models/HabitatSuitability.pt"

    # Cloudinary (image storage)
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # OpenWeatherMap (fire forecast)
    OPENWEATHER_API_KEY: str = ""

    # CORS — comma-separated list of allowed origins
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    # Telegram Bot (poaching alerts)
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    # NASA FIRMS
    NASA_FIRMS_API_KEY: str = ""
    FIRMS_BBOX: str = "68.0,8.0,97.0,37.0"
    FIRMS_REFRESH_INTERVAL: int = 180


settings = Settings()
