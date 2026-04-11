"""AI Ranger Chatbot — Groq-powered endpoint with live WildEye MongoDB context.

Groq: genuinely free tier (100K tokens/day), no credit card.
Get your key at: https://console.groq.com
"""

import json
import logging
import os
from typing import Annotated

import httpx

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chatbot"])

# Groq — OpenAI-compatible, genuinely free (100K tokens/day, no credit card)
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL   = "llama-3.3-70b-versatile"   # best quality; fallback: llama-3.1-8b-instant

SYSTEM_PROMPT = """You are WildEye Ranger Assistant, an AI helping wildlife rangers and conservationists monitor forests and wildlife.

You have access to real-time data from the WildEye platform pulled directly from the database. Answer questions accurately based on this data. Be concise, factual, and helpful. Use ranger-friendly language.

When referencing counts or statistics, be precise. When there is no data available, say so clearly instead of guessing.

Format responses cleanly — use short bullet points for lists, bold for important values, and keep answers under 150 words unless a detailed breakdown is specifically requested."""


def get_db(request: Request) -> AsyncIOMotorDatabase:
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


def classify_intent(message: str) -> list[str]:
    """Simple keyword-based intent classifier → list of relevant collections."""
    msg = message.lower()
    collections: set[str] = set()

    if any(k in msg for k in ["tiger", "elephant", "leopard", "lion", "species", "animal", "spotted", "detected", "wildlife", "bird", "mammal"]):
        collections.add("wildlife")
    if any(k in msg for k in ["poach", "alert", "suspicious", "human", "intruder", "illegal", "armed"]):
        collections.add("poaching")
    if any(k in msg for k in ["fire", "smoke", "burn", "risk", "hotspot", "wildfire", "flame", "zone"]):
        collections.add("fire")
    if any(k in msg for k in ["habitat", "suitable", "zone", "territory", "ecosystem", "suitability"]):
        collections.add("habitat")

    # Fallback: general queries get all collections
    if not collections:
        collections = {"wildlife", "poaching", "fire", "habitat"}

    return list(collections)


def _doc_to_safe(doc: dict, fields: list[str]) -> dict:
    """Extract fields from a Mongo doc, converting non-JSON-safe values to strings."""
    result = {}
    for f in fields:
        val = doc.get(f)
        if val is None:
            continue
        try:
            json.dumps(val)
            result[f] = val
        except (TypeError, ValueError):
            result[f] = str(val)
    return result


async def build_context(db: AsyncIOMotorDatabase, collections: list[str]) -> dict:
    """Query MongoDB and return a compact context dict for Groq."""
    context: dict = {}

    if "wildlife" in collections:
        docs = []
        async for doc in db["detections"].find(
            {}, {"species": 1, "confidence": 1, "timestamp": 1, "location": 1, "_id": 0}
        ).sort("timestamp", -1).limit(20):
            docs.append(_doc_to_safe(doc, ["species", "confidence", "timestamp", "location"]))
        context["wildlife_detections"] = docs

    if "poaching" in collections:
        docs = []
        async for doc in db["poaching_alerts"].find(
            {}, {"status": 1, "confidence": 1, "timestamp": 1, "location": 1, "isSuspicious": 1, "_id": 0}
        ).sort("timestamp", -1).limit(10):
            docs.append(_doc_to_safe(doc, ["status", "confidence", "timestamp", "location", "isSuspicious"]))
        context["poaching_alerts"] = docs

    if "fire" in collections:
        docs = []
        async for doc in db["fire_hotspots"].find(
            {}, {"riskLevel": 1, "temperature": 1, "timestamp": 1, "location": 1, "_id": 0}
        ).sort("timestamp", -1).limit(10):
            docs.append(_doc_to_safe(doc, ["riskLevel", "temperature", "timestamp", "location"]))
        context["fire_hotspots"] = docs

    if "habitat" in collections:
        docs = []
        async for doc in db["habitat_predictions"].find(
            {}, {"species": 1, "suitability": 1, "timestamp": 1, "_id": 0}
        ).sort("timestamp", -1).limit(10):
            docs.append(_doc_to_safe(doc, ["species", "suitability", "timestamp"]))
        context["habitat_predictions"] = docs

    return context


class HistoryEntry(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[HistoryEntry] = []


@router.post("")
async def chat(
    body: ChatRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    """Accept a ranger question + history, inject live DB context, query Groq, return response."""

    # Read key on every request so new .env values take effect without restart
    api_key = (
        os.getenv("GROQ_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("OPENROUTER_API_KEY")
        or ""
    )
    if not api_key:
        return {"response": "Chatbot not configured. Add GROQ_API_KEY to backend/.env (free at console.groq.com)."}

    try:
        # 1 — Classify intent
        collections = classify_intent(body.message)

        # 2 — Query MongoDB for live context
        context = await build_context(db, collections)
        context_json = json.dumps(context, indent=2, default=str)

        # 3 — Build OpenAI-compatible messages list
        user_content = (
            f"[LIVE DATA FROM WILDEYE DATABASE]\n{context_json}\n\n"
            f"[RANGER QUESTION]\n{body.message}"
        )

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for entry in body.history[-20:]:
            if entry.role in ("user", "assistant"):
                messages.append({"role": entry.role, "content": entry.content})
        messages.append({"role": "user", "content": user_content})

        # 4 — Call Groq API (async httpx — never blocks event loop)
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                GROQ_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": messages,
                    "max_tokens": 1024,
                },
            )
            if resp.status_code != 200:
                body_text = resp.text[:300]
                logger.error("Groq API error %s: %s", resp.status_code, body_text)
                return {"response": f"AI error {resp.status_code}: {body_text}"}

            data = resp.json()

        response_text = data["choices"][0]["message"]["content"]
        return {"response": response_text}

    except Exception as exc:
        import traceback
        print(f"[WildEye Chat ERROR]\n{traceback.format_exc()}")
        logger.error("Chatbot error: %s", exc)
        return {"response": f"Error: {exc}"}
