"""
OTP Service — Hashed, single-use, rate-limited OTP storage and verification.
Handles E.164 phone normalization, SHA-256 hashed code verification, and resend cooldowns.
"""

import hashlib
import re
import time
from typing import Dict, Optional, Tuple
import structlog

logger = structlog.get_logger()

# ── E.164 Normalization ────────────────────────────────────────────────────────

def normalize_e164(phone: str, default_country_code: str = "+91") -> str:
    """
    Normalizes a phone number to standard E.164 format.
    Example: '9876543210', '+91' -> '+919876543210'
    """
    clean = re.sub(r"[^\d+]", "", phone.strip())
    if not clean:
        raise ValueError("Invalid phone number format")

    if clean.startswith("+"):
        normalized = clean
    else:
        cc = default_country_code if default_country_code.startswith("+") else f"+{default_country_code}"
        normalized = f"{cc}{clean}"

    # E.164 pattern validation: + followed by 7 to 15 digits
    if not re.match(r"^\+[1-9]\d{6,14}$", normalized):
        raise ValueError("Phone number must follow E.164 international standard (+919876543210)")

    return normalized


# ── In-Memory Hashed OTP Store ─────────────────────────────────────────────────

class OTPRecord:
    def __init__(self, identifier_hash: str, otp_hash: str, ttl_seconds: int = 300, cooldown_seconds: int = 30):
        now = time.time()
        self.identifier_hash = identifier_hash
        self.otp_hash = otp_hash
        self.created_at = now
        self.expires_at = now + ttl_seconds
        self.resend_available_at = now + cooldown_seconds
        self.attempts = 0
        self.used = False


_otp_store: Dict[str, OTPRecord] = {}


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.strip().encode("utf-8")).hexdigest()


def _hash_otp(identifier: str, code: str) -> str:
    combined = f"{identifier.strip().lower()}:{code.strip()}"
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def issue_otp(identifier: str, fixed_code: Optional[str] = None) -> Tuple[str, int]:
    """
    Generates and stores a hashed 6-digit OTP code for the given identifier (phone or email).
    Returns (raw_otp_code, resend_cooldown_seconds).
    In dev mode or test mode, returns fixed_code if provided or '123456' for predictable testing.
    """
    clean_id = identifier.strip().lower()
    id_hash = _hash_value(clean_id)
    now = time.time()

    # Check resend cooldown
    existing = _otp_store.get(id_hash)
    if existing and not existing.used and now < existing.resend_available_at:
        wait = int(existing.resend_available_at - now) + 1
        raise ValueError(f"Please wait {wait} seconds before requesting a new code.")

    # Generate 6-digit code
    if fixed_code:
        code = fixed_code
    else:
        import secrets
        code = f"{secrets.randbelow(900000) + 100000}"

    code_hash = _hash_otp(clean_id, code)
    record = OTPRecord(identifier_hash=id_hash, otp_hash=code_hash, ttl_seconds=300, cooldown_seconds=30)
    _otp_store[id_hash] = record

    logger.info("otp.issued", identifier_hash=id_hash[:8], expires_in=300)
    return code, 30


def verify_otp(identifier: str, code: str) -> bool:
    """
    Verifies a 6-digit OTP code against the hashed record.
    Invalidates the OTP on success or after 5 failed attempts.
    """
    clean_id = identifier.strip().lower()
    id_hash = _hash_value(clean_id)
    record = _otp_store.get(id_hash)
    now = time.time()

    if not record:
        logger.warning("otp.verify_failed", reason="no_record", identifier_hash=id_hash[:8])
        return False

    if record.used:
        logger.warning("otp.verify_failed", reason="already_used", identifier_hash=id_hash[:8])
        return False

    if now > record.expires_at:
        logger.warning("otp.verify_failed", reason="expired", identifier_hash=id_hash[:8])
        return False

    record.attempts += 1
    if record.attempts > 5:
        record.used = True
        logger.warning("otp.verify_failed", reason="max_attempts_exceeded", identifier_hash=id_hash[:8])
        return False

    target_hash = _hash_otp(clean_id, code)
    if target_hash == record.otp_hash:
        record.used = True
        logger.info("otp.verified_success", identifier_hash=id_hash[:8])
        return True

    logger.warning("otp.verify_failed", reason="invalid_code", attempts=record.attempts)
    return False
