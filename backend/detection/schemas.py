"""Pydantic schemas for wildlife and poaching detection (aligned with frontend types)."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Location(BaseModel):
    lat: float
    lon: float
    name: str


class Detection(BaseModel):
    id: str
    species: str
    confidence: float = Field(..., ge=0, le=100)
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2 (xyxy)
    timestamp: str  # ISO 8601
    location: Location
    imageUrl: Optional[str] = None
    enhancedImageUrl: Optional[str] = None


class WildlifeDetectionResult(BaseModel):
    detections: list[Detection]
    timestamp: str  # ISO 8601
    location: Location
    enhancedImageUrl: Optional[str] = None


PoachingStatus = Literal["Pending", "Reviewed", "Confirmed", "False Positive"]


class PoachingAlert(BaseModel):
    id: str
    isSuspicious: bool
    confidence: float = Field(..., ge=0, le=100)
    alertSent: bool
    detectedObjects: list[str]
    status: PoachingStatus
    timestamp: str  # ISO 8601
    location: Location
    imageUrl: Optional[str] = None
    processedImageUrl: Optional[str] = None
    mode: Optional[str] = "normal"


FireRiskLevel = Literal["Low", "Medium", "High", "Critical"]


class FirePrediction(BaseModel):
    riskLevel: FireRiskLevel
    probability: float = Field(..., ge=0, le=1)
    forecast: list[dict]  # [{ day: int, probability: float }, ...]
    recommendations: str
    location: Location
    imageUrl: Optional[str] = None


class FireHotspot(BaseModel):
    id: str
    location: Location
    riskLevel: FireRiskLevel
    probability: float = Field(..., ge=0, le=1)
    timestamp: str  # ISO 8601


class HabitatPrediction(BaseModel):
    suitability: Literal["High", "Medium", "Low"]
    confidence: float = Field(..., ge=0, le=100)
    factors: dict[str, str]  # temperature, rainfall, elevation, forestCover, ndvi
    species: str
    region: str




class MigrationPoint(BaseModel):
    lat: float
    lng: float
    timestamp: str
    sequence: int


class MigrationInsights(BaseModel):
    dominant_direction: str
    avg_speed_kmph: float
    most_active_hour: int
    most_active_period: str
    estimated_range_km2: float


class MigrationResponse(BaseModel):
    species: str
    total_sightings: int
    corridor: list[MigrationPoint]
    insights: MigrationInsights
