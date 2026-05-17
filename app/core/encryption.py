"""
Symmetric encryption for sensitive fields (e.g. data source auth credentials).

Uses Fernet (AES-128-CBC + HMAC-SHA256) derived from the app SECRET_KEY.
Empty strings are stored as-is (no encryption overhead for blank values).
"""

import base64
import hashlib
from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    from app.config import settings
    # Derive a 32-byte key from SECRET_KEY using SHA-256, then base64url-encode
    raw = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def encrypt(value: str) -> str:
    """Encrypt a plaintext string. Returns empty string unchanged."""
    if not value:
        return value
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a Fernet token back to plaintext. Returns empty string unchanged."""
    if not token:
        return token
    try:
        return _get_fernet().decrypt(token.encode()).decode()
    except Exception:
        # Already plaintext (legacy rows before encryption was added)
        return token
