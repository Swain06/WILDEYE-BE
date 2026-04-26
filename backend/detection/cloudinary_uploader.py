"""Cloudinary image upload helper.

Uploads raw image bytes to Cloudinary and returns the secure URL.
Returns None (never raises) when credentials are missing or the upload fails,
so callers can store imageUrl=None as a safe fallback.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def upload_image_bytes(data: bytes, folder: str = "wildeye") -> Optional[str]:
    """Upload *data* to Cloudinary and return the secure_url, or None on failure."""
    try:
        from config import settings

        if not all([settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET]):
            logger.debug("Cloudinary credentials not configured; skipping upload.")
            return None

        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )

        response = cloudinary.uploader.upload(data, folder=folder, resource_type="image")
        url: str = response.get("secure_url", "")
        return url if url else None

    except Exception as exc:  # noqa: BLE001
        logger.warning("Cloudinary upload failed: %s", exc)
        return None
