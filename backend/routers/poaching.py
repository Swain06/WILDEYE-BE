"""Poaching detection API: analyze image with YOLO, list/update alerts in MongoDB.
Sends optional Telegram and/or Gmail email notifications on high-confidence detections.
"""

import asyncio
import logging
import os
import smtplib
import uuid
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Annotated

import httpx

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from pydantic import BaseModel

from config import settings
from detection.cloudinary_uploader import upload_image_bytes
from detection.poaching_detector import run_poaching_detection
from detection.schemas import Location, PoachingAlert, PoachingStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/poaching", tags=["Poaching Detection"])

COLLECTION = "poaching_alerts"

# ── Email config (read on every request so hot-swap of .env values works) ───
def _get_email_config() -> tuple[str, str, str]:
    user     = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "").replace(" ", "")  # strip spaces from App Password groups
    # Support both ALERT_RECIPIENTS (plural, .env) and ALERT_RECIPIENT (singular)
    recipient = os.getenv("ALERT_RECIPIENTS") or os.getenv("ALERT_RECIPIENT", "")
    return user, password, recipient

# Legacy module-level cache (kept for send_poaching_email backward compat)
SMTP_USER      = os.getenv("SMTP_USER")
SMTP_PASSWORD  = (os.getenv("SMTP_PASSWORD") or "").replace(" ", "")
ALERT_RECIPIENT = os.getenv("ALERT_RECIPIENTS") or os.getenv("ALERT_RECIPIENT")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


# ── Telegram ─────────────────────────────────────────────────────────────────

async def _send_telegram(alert: PoachingAlert) -> None:
    """Fire-and-forget Telegram notification. Silently skipped if env vars are missing."""
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        return
    time_str = alert.timestamp[:16].replace("T", " ") + " UTC" if alert.timestamp else "Unknown"
    text = (
        f"🚨 <b>POACHING ALERT</b>\n\n"
        f"Confidence: {alert.confidence:.0f}%\n"
        f"Alert ID: {alert.id}\n"
        f"Time: {time_str}\n"
        f"Status: {alert.status}\n\n"
        f"Review in WildEye dashboard."
    )
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            )
            if not resp.is_success:
                logger.warning("Telegram API error %s: %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.error("Telegram notification failed: %s", exc)


# HTML template for the email body
def _make_html(alert_id: str, confidence: float, timestamp: str, image_url: str | None) -> str:
    image_block = (
        f'<img src="{image_url}" style="max-width:100%;border-radius:8px;margin-top:12px;" />'
        if image_url else '<p style="color:#888;">No image available</p>'
    )
    return f"""
<html><body style="font-family:sans-serif;background:#f9f9f9;padding:24px;">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e5e5;">
    <h2 style="color:#dc2626;margin:0 0 4px;">🚨 Poaching Alert Detected</h2>
    <p style="color:#666;margin:0 0 20px;font-size:14px;">WildEye AI Surveillance System</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      <tr><td style="padding:8px 0;color:#888;width:120px;">Confidence</td>
          <td style="padding:8px 0;font-weight:bold;color:#dc2626;">{int(confidence)}%</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Alert ID</td>
          <td style="padding:8px 0;font-family:monospace;">{alert_id}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Time</td>
          <td style="padding:8px 0;">{timestamp} UTC</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Status</td>
          <td style="padding:8px 0;"><span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:999px;font-size:13px;">Pending Review</span></td></tr>
    </table>
    {image_block}
    <p style="margin-top:24px;font-size:13px;color:#888;">Log in to the WildEye dashboard to review and update this alert.</p>
  </div>
</body></html>"""


async def send_poaching_email(
    alert_id: str, confidence: float, timestamp: str, image_url: str | None = None
) -> None:
    """Send alert email via Resend HTTP API (port 443 — works even when SMTP is blocked).
    Falls back gracefully if RESEND_API_KEY is not set.
    """
    resend_key   = os.getenv("RESEND_API_KEY", "")
    smtp_user    = SMTP_USER
    smtp_pass    = SMTP_PASSWORD
    recipient    = ALERT_RECIPIENT

    if not recipient:
        logger.warning("[WildEye] Email skipped — ALERT_RECIPIENTS not set in .env")
        return

    subject = f"🚨 WildEye Poaching Alert — {int(confidence)}% Confidence"
    html    = _make_html(alert_id, confidence, timestamp, image_url)

    # ── Resend API (recommended — works on any network via HTTPS port 443) ──
    if resend_key:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": "WildEye Alerts <onboarding@resend.dev>",
                        "to": [recipient],
                        "subject": subject,
                        "html": html,
                    },
                )
            if resp.status_code in (200, 201):
                logger.info("[WildEye] Email sent via Resend to %s", recipient)
            else:
                logger.error("[WildEye] Resend error %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.error("[WildEye] Resend request failed: %s", exc)
        return

    # ── Fallback: SMTP (may be blocked on some networks) ──────────────────────
    if not smtp_user or not smtp_pass:
        logger.warning("[WildEye] Email skipped — set RESEND_API_KEY or SMTP_USER+SMTP_PASSWORD in .env")
        return

    import smtplib, ssl
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = smtp_user
    msg["To"]      = recipient
    msg.attach(MIMEText(html, "html"))

    ctx = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx, timeout=10) as s:
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_user, recipient, msg.as_string())
        logger.info("[WildEye] Email sent via SMTP port 465 to %s", recipient)
    except Exception as e465:
        logger.warning("[WildEye] Port 465 failed: %s — trying 587…", e465)
        try:
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as s:
                s.ehlo(); s.starttls(context=ctx); s.ehlo()
                s.login(smtp_user, smtp_pass)
                s.sendmail(smtp_user, recipient, msg.as_string())
            logger.info("[WildEye] Email sent via SMTP port 587 to %s", recipient)
        except Exception as e587:
            logger.error("[WildEye] Both SMTP ports blocked. 465=%s 587=%s", e465, e587)



# ── Detection endpoint ────────────────────────────────────────────────────────

@router.post("/analyze", response_model=PoachingAlert)
async def analyze_poaching(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    image: Annotated[UploadFile, File(description="Surveillance / camera trap image")],
    location_name: Annotated[str | None, Form()] = None,
    lat: Annotated[float | None, Form()] = None,
    lon: Annotated[float | None, Form()] = None,
    confidence: Annotated[float | None, Form()] = None,
    enable_telegram: Annotated[bool, Form()] = False,
    enable_email: Annotated[bool, Form()] = True,
):
    """Upload an image, run poaching detection (YOLO), save alert to MongoDB, return result."""
    location = Location(
        lat=lat if lat is not None else 0.0,
        lon=lon if lon is not None else 0.0,
        name=location_name or "Unknown",
    )
    yolo_conf = 0.25
    alert_threshold_pct = confidence if confidence is not None else 0.0
    contents = await image.read()

    detected_objects, max_conf_pct = run_poaching_detection(
        image=contents,
        confidence=yolo_conf,
    )

    is_suspicious = len(detected_objects) > 0
    alert_sent = is_suspicious and (alert_threshold_pct <= 0 or max_conf_pct >= alert_threshold_pct)
    now_iso = datetime.utcnow().isoformat() + "Z"
    alert_id = str(uuid.uuid4())

    image_url = upload_image_bytes(contents, folder="wildeye/poaching")

    alert = PoachingAlert(
        id=alert_id,
        isSuspicious=is_suspicious,
        confidence=max_conf_pct if is_suspicious else 0.0,
        alertSent=alert_sent,
        detectedObjects=detected_objects,
        status="Pending",
        timestamp=now_iso,
        location=location,
        imageUrl=image_url,
    )

    doc = alert.model_dump()
    await db[COLLECTION].insert_one(doc)

    # ── Background notifications ──────────────────────────────────────────────
    # Threshold: any detection ≥ 30% triggers alerts (70% was too strict)
    ALERT_CONFIDENCE_THRESHOLD = float(os.getenv("ALERT_CONFIDENCE_THRESHOLD", "30.0"))
    should_alert = is_suspicious and max_conf_pct >= ALERT_CONFIDENCE_THRESHOLD

    logger.info(
        "[WildEye] Detection result — suspicious=%s conf=%.1f%% threshold=%.1f%% "
        "enable_telegram=%s enable_email=%s should_alert=%s",
        is_suspicious, max_conf_pct, ALERT_CONFIDENCE_THRESHOLD,
        enable_telegram, enable_email, should_alert,
    )

    # Keep task references in a module-level set so the GC doesn't cancel them
    _bg_tasks: set = set()

    if enable_telegram and should_alert:
        logger.info("[WildEye] Firing Telegram alert for alert_id=%s", alert_id)
        task = asyncio.create_task(_send_telegram(alert))
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)
    elif enable_telegram:
        logger.info("[WildEye] Telegram skipped — suspicious=%s conf=%.1f%%", is_suspicious, max_conf_pct)

    if enable_email and should_alert:
        logger.info("[WildEye] Firing email alert for alert_id=%s", alert_id)
        timestamp_clean = now_iso[:16].replace("T", " ")
        task = asyncio.create_task(
            send_poaching_email(
                alert_id=alert_id,
                confidence=max_conf_pct,
                timestamp=timestamp_clean,
                image_url=image_url,
            )
        )
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)
    elif enable_email:
        logger.info("[WildEye] Email skipped — suspicious=%s conf=%.1f%%", is_suspicious, max_conf_pct)

    return alert


# ── List / update endpoints ───────────────────────────────────────────────────

@router.get("/alerts", response_model=dict)
async def list_poaching_alerts(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    status: Annotated[str | None, Query(description="Filter by status; 'All' or omit for no filter")] = None,
    search: Annotated[str | None, Query(description="Search in alert ID and location name")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """List poaching alerts with optional status and text search, paginated."""
    filter_query: dict = {}
    if status and status != "All":
        filter_query["status"] = status
    if search and search.strip():
        strip = search.strip()
        filter_query["$or"] = [
            {"id": {"$regex": strip, "$options": "i"}},
            {"location.name": {"$regex": strip, "$options": "i"}},
        ]

    cursor = db[COLLECTION].find(filter_query).sort("timestamp", -1).skip(offset).limit(limit)
    total = await db[COLLECTION].count_documents(filter_query)
    items = []
    async for doc in cursor:
        doc.pop("_id", None)
        items.append(PoachingAlert(**doc))

    return {"items": items, "total": total}


class UpdateAlertStatusBody(BaseModel):
    status: PoachingStatus


@router.patch("/alerts/{alert_id}", response_model=PoachingAlert)
async def update_poaching_alert_status(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    alert_id: str,
    body: UpdateAlertStatusBody,
):
    """Update a poaching alert's status (e.g. Pending → Reviewed, Confirmed, False Positive)."""
    result = await db[COLLECTION].find_one_and_update(
        {"id": alert_id},
        {"$set": {"status": body.status}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    result.pop("_id", None)
    return PoachingAlert(**result)
