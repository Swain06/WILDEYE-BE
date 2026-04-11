"""Wildlife News router — focused on wildlife crimes, poaching, and conservation.

Enriches each article with:
  - category (Poaching / Rescue / Conservation / Law Enforcement / General)
  - threatLevel (High / Medium / Low)
  - entities (animals, weapons, organisations)
  - location (best-effort extraction from title/description)
"""

import logging
import os
import re

import httpx
from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/news", tags=["News"])

NEWSAPI_URL = "https://newsapi.org/v2/everything"

# Highly targeted query — focuses on wildlife crimes and conservation
NEWSAPI_QUERY = (
    "poaching OR \"illegal hunting\" OR \"wildlife trafficking\" OR \"animal smuggling\" "
    "OR \"anti-poaching\" OR \"wildlife crime\" OR \"endangered species\" OR \"wildlife rescue\" "
    "OR \"forest crime\" OR \"tiger poaching\" OR \"elephant poaching\" OR \"rhino poaching\" "
    "OR \"wildlife protection\" OR \"wildlife conservation\" OR \"animal trafficking\" "
    "OR \"wildlife raid\" OR \"forest guard\" OR \"wildlife law enforcement\""
)

# ── Exclusion keywords (drop articles that match ALL wildlife signals but are irrelevant) ─
EXCLUDE_KEYWORDS = [
    "pet food", "cat food", "dog food", "puppy", "kitten", "veterinary clinic",
    "livestock farming", "dairy farm", "poultry farm", "zoo ticket",
    "theme park", "circus show", "pet grooming",
]

# ── Categorisation rules (order matters — first match wins) ──────────────────
CATEGORY_RULES = [
    ("Poaching", [
        "poach", "illegal hunt", "wildlife traffick", "animal smuggl",
        "wildlife crime", "snare", "trap", "tusk", "ivory", "horn trafficking",
        "crossbow", "rifle hunt", "illegal kill", "forest crime",
    ]),
    ("Law Enforcement", [
        "anti-poach", "wildlife squad", "forest guard", "arrested", "seized",
        "convicted", "crackdown", "raid", "law enforcement", "wildlife police",
        "wildlife protection act", "prosecution",
    ]),
    ("Rescue", [
        "rescue", "rehabilitat", "sanctuary", "release", "freed", "saved",
        "recover", "treatment", "veterinary", "care center",
    ]),
    ("Conservation", [
        "conservation", "protect", "reserve", "national park", "habitat",
        "breeding programme", "reintroduce", "population recovery",
        "endangered", "extinct", "biodiversity",
    ]),
]

# ── Threat level rules ───────────────────────────────────────────────────────
HIGH_THREAT = [
    "mass killing", "extinction", "organized crime", "trafficking network",
    "gang", "international smuggling", "militant", "armed poacher",
    "crisis", "emergency", "devastating", "massacre",
]
MEDIUM_THREAT = [
    "poach", "illegal hunt", "snare", "trap", "seized", "arrested",
    "smuggl", "traffick", "endangered", "threat", "concern", "decline",
]

# ── Animal entities ──────────────────────────────────────────────────────────
ANIMAL_KEYWORDS = [
    "tiger", "elephant", "rhino", "rhinoceros", "leopard", "lion", "cheetah",
    "pangolin", "bear", "wolf", "deer", "antelope", "turtle", "tortoise",
    "python", "cobra", "crocodile", "eagle", "vulture", "parrot", "macaw",
    "orangutan", "gorilla", "chimpanzee", "whale", "dolphin", "shark",
    "seahorse", "coral", "snow leopard", "jaguar", "puma",
]

# ── Weapon entities ──────────────────────────────────────────────────────────
WEAPON_KEYWORDS = [
    "rifle", "shotgun", "crossbow", "snare", "trap", "poison", "net",
    "spear", "dart", "machete", "firearm", "gun", "bow",
]

# ── Organisation keywords ────────────────────────────────────────────────────
ORG_KEYWORDS = [
    "wwf", "traffic", "interpol", "cites", "iucn", "forest department",
    "wildlife crime unit", "ranger", "wildlife sos", "wildlife trust",
    "green peace", "wildlife institute",
]

# ── Country/region hints ─────────────────────────────────────────────────────
LOCATION_HINTS = [
    "india", "africa", "kenya", "tanzania", "zimbabwe", "south africa",
    "indonesia", "malaysia", "thailand", "vietnam", "china", "nepal",
    "sri lanka", "bangladesh", "brazil", "amazon", "borneo", "sumatra",
    "cameroon", "congo", "myanmar", "laos", "cambodia", "philippines",
    "madagascar", "mozambique", "uganda", "rwanda", "ethiopia",
]


def _text(article: dict) -> str:
    return f"{article.get('title', '')} {article.get('description', '')}".lower()


def _categorise(text: str) -> str:
    for category, keywords in CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return category
    return "General"


def _threat_level(text: str) -> str:
    if any(kw in text for kw in HIGH_THREAT):
        return "High"
    if any(kw in text for kw in MEDIUM_THREAT):
        return "Medium"
    return "Low"


def _extract_entities(text: str) -> dict:
    animals = [a.capitalize() for a in ANIMAL_KEYWORDS if a in text]
    weapons = [w.capitalize() for w in WEAPON_KEYWORDS if w in text]
    orgs = [o.upper() for o in ORG_KEYWORDS if o in text]
    return {
        "animals": list(dict.fromkeys(animals))[:5],
        "weapons": list(dict.fromkeys(weapons))[:4],
        "organizations": list(dict.fromkeys(orgs))[:4],
    }


def _extract_location(text: str) -> str:
    found = [loc.title() for loc in LOCATION_HINTS if loc in text]
    return ", ".join(list(dict.fromkeys(found))[:3]) if found else ""


def _is_relevant(text: str) -> bool:
    """Return False for articles that are clearly off-topic."""
    # Must contain at least one wildlife-related signal
    wildlife_signals = [
        "wildlife", "animal", "poach", "conservation", "forest", "species",
        "ranger", "tiger", "elephant", "rhino", "leopard", "pangolin",
        "smuggl", "traffick", "illegal hunt", "endangered",
    ]
    if not any(sig in text for sig in wildlife_signals):
        return False
    # Drop if any exclusion keyword appears prominently
    if any(ex in text for ex in EXCLUDE_KEYWORDS):
        return False
    return True


@router.get("")
async def get_news():
    """Fetch, filter, and enrich wildlife crime & conservation news."""
    api_key = os.getenv("NEWS_API_KEY", "")
    if not api_key:
        return {"articles": []}

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                NEWSAPI_URL,
                params={
                    "q": NEWSAPI_QUERY,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "pageSize": 100,
                    "apiKey": api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        articles = []
        for a in data.get("articles", []):
            title = a.get("title", "")
            description = a.get("description") or ""

            # Skip removed or blank
            if not title or title == "[Removed]":
                continue

            text = f"{title} {description}".lower()

            # Relevance gate
            if not _is_relevant(text):
                continue

            articles.append({
                "title": title,
                "description": description,
                "url": a.get("url", ""),
                "imageUrl": a.get("urlToImage") or "",
                "source": a.get("source", {}).get("name", "Unknown"),
                "publishedAt": a.get("publishedAt", ""),
                # ── Enriched fields ───────────────────────────────────────
                "category": _categorise(text),
                "threatLevel": _threat_level(text),
                "location": _extract_location(text),
                "entities": _extract_entities(text),
            })

        # Sort: High threat first, then by date
        threat_order = {"High": 0, "Medium": 1, "Low": 2}
        articles.sort(key=lambda x: (threat_order[x["threatLevel"]], x["publishedAt"] and -1 or 0))

        return {"articles": articles}

    except Exception as exc:
        logger.error("NewsAPI error: %s", exc)
        return {"articles": []}
