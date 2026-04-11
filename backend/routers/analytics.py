"""Analytics API — aggregated stats for wildlife detections, poaching alerts, and fire hotspots."""

import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/analytics", tags=["Analytics"])

DETECTIONS_COL = "detections"
POACHING_COL = "poaching_alerts"
FIRE_COL = "fire_hotspots"


def get_db(request: Request) -> AsyncIOMotorDatabase:
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


def _month_label(ts: str) -> str:
    """Convert an ISO timestamp to 'Mon YYYY' label, e.g. 'Jan 2025'."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%b %Y")
    except Exception:
        return "Unknown"


def _last_n_months(n: int = 6) -> list[str]:
    """Return the last n month labels in chronological order."""
    now = datetime.now(timezone.utc)
    labels = []
    for i in range(n - 1, -1, -1):
        month = (now.month - i - 1) % 12 + 1
        year = now.year - ((now.month - i - 1) // 12 + (1 if (now.month - i - 1) < 0 else 0))
        # Simpler calculation
        dt = datetime(now.year, now.month, 1)
        # Subtract i months
        m = dt.month - i
        y = dt.year
        while m <= 0:
            m += 12
            y -= 1
        labels.append(datetime(y, m, 1).strftime("%b %Y"))
    return labels


def safe_float(v, default: float = 0.0) -> float:
    try:
        f = float(v)
        return f if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default


# ── Wildlife ──────────────────────────────────────────────────────────────────

@router.get("/wildlife")
async def analytics_wildlife(db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]):
    species_count: dict[str, int] = defaultdict(int)
    month_species: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    async for doc in db[DETECTIONS_COL].find({}, {"species": 1, "timestamp": 1, "_id": 0}):
        species = doc.get("species") or "Unknown"
        ts = doc.get("timestamp") or ""
        species_count[species] += 1
        month = _month_label(ts)
        month_species[month][species] += 1

    # Top 10 species sorted by count
    by_species = sorted(
        [{"species": s, "count": c} for s, c in species_count.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    top_species = [row["species"] for row in by_species]
    months = _last_n_months(6)
    by_month = []
    for m in months:
        row: dict = {"month": m}
        for sp in top_species:
            row[sp] = month_species.get(m, {}).get(sp, 0)
        by_month.append(row)

    return {"bySpecies": by_species, "byMonth": by_month}


# ── Poaching ──────────────────────────────────────────────────────────────────

@router.get("/poaching")
async def analytics_poaching(db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]):
    status_count: dict[str, int] = defaultdict(int)
    month_count: dict[str, int] = defaultdict(int)

    async for doc in db[POACHING_COL].find({}, {"status": 1, "timestamp": 1, "_id": 0}):
        status = doc.get("status") or "Pending"
        status_count[status] += 1
        month = _month_label(doc.get("timestamp") or "")
        month_count[month] += 1

    by_status = [{"status": s, "count": c} for s, c in status_count.items()]
    months = _last_n_months(6)
    by_month = [{"month": m, "count": month_count.get(m, 0)} for m in months]

    return {"byStatus": by_status, "byMonth": by_month}


# ── Fire ──────────────────────────────────────────────────────────────────────

@router.get("/fire")
async def analytics_fire(db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]):
    RISK_LEVELS = ["Low", "Medium", "High", "Critical"]
    risk_count: dict[str, int] = defaultdict(int)
    month_risk: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    async for doc in db[FIRE_COL].find({}, {"riskLevel": 1, "timestamp": 1, "_id": 0}):
        risk = doc.get("riskLevel") or "Low"
        risk_count[risk] += 1
        month = _month_label(doc.get("timestamp") or "")
        month_risk[month][risk] += 1

    by_risk_level = [{"riskLevel": r, "count": risk_count.get(r, 0)} for r in RISK_LEVELS]

    months = _last_n_months(6)
    by_month = []
    for m in months:
        row: dict = {"month": m}
        for r in RISK_LEVELS:
            row[r] = month_risk.get(m, {}).get(r, 0)
        by_month.append(row)

    return {"byRiskLevel": by_risk_level, "byMonth": by_month}
