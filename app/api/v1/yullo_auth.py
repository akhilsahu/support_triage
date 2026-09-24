"""
Yullo Unified Passwordless Auth Router (`/api/v1/yullo/auth/*`).
Supports Google OAuth, Phone OTP (E.164), and Email OTP.
Authenticates User/Account identity without implicitly creating public Spaces.
"""

from typing import Optional
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import create_token
from app.models.user import User
from app.models.auth_identity import AuthIdentity
from app.models.space import Space
from app.services.auth.otp_service import normalize_e164, issue_otp, verify_otp

logger = structlog.get_logger()
router = APIRouter(prefix="/yullo/auth", tags=["yullo-auth"])


# ── Pydantic Request Models ────────────────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    google_sub: str
    email: EmailStr
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class SendPhoneOtpRequest(BaseModel):
    phone: str
    country_code: Optional[str] = "+91"


class VerifyPhoneOtpRequest(BaseModel):
    phone: str
    code: str
    country_code: Optional[str] = "+91"


class SendEmailOtpRequest(BaseModel):
    email: EmailStr


class VerifyEmailOtpRequest(BaseModel):
    email: EmailStr
    code: str


class AuthResponseData(BaseModel):
    is_new_user: bool
    user: dict
    csrf_token: str


# ── Helper: Set Auth Cookie & Return Response ──────────────────────────────────

from app.yullo.services.auth.session_service import create_yullo_session

async def _build_auth_response(user: User, response: Response, db: AsyncSession) -> AuthResponseData:
    """Generates a secure revocable session and sets HttpOnly cookie."""
    csrf_token = await create_yullo_session(db, user.id, response)
    
    is_new = not user.onboarding_completed
    return AuthResponseData(
        is_new_user=is_new,
        user=user.to_dict(),
        csrf_token=csrf_token
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/check-handle")
async def check_handle(slug: str = Query(...), db: AsyncSession = Depends(get_db)):
    """
    Validates whether a handle is available for registration without exposing reserved lists.
    Returns {"available": bool, "reserved": bool, "reason": str|None}.
    """
    clean_slug = slug.strip().lower()
    if not clean_slug or len(clean_slug) < 2:
        return {"available": False, "reserved": False, "reason": "too_short"}

    from app.utils.reserved_slugs import is_reserved_slug
    if is_reserved_slug(clean_slug):
        return {"available": False, "reserved": True, "reason": "reserved"}

    try:
        res = await db.execute(select(Space).where(Space.slug == clean_slug))
        if res.scalars().first():
            return {"available": False, "reserved": False, "reason": "taken"}
    except Exception as err:
        logger.warning("yullo_auth.check_handle_db_error", error=str(err))

    return {"available": True, "reserved": False, "reason": None}


@router.post("/google", response_model=AuthResponseData)
async def google_auth(req: GoogleAuthRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Authenticates or registers a user via Google OAuth identity."""
    clean_email = req.email.strip().lower()

    # 1. Lookup existing AuthIdentity for Google sub
    res = await db.execute(
        select(AuthIdentity).where(
            AuthIdentity.provider == "google",
            AuthIdentity.provider_subject == req.google_sub.strip()
        )
    )
    identity = res.scalar_one_or_none()

    if identity:
        # Fetch existing user
        user_res = await db.execute(select(User).where(User.id == identity.user_id))
        user = user_res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=400, detail="Account not found.")
        logger.info("yullo_auth.google_login_existing", user_id=str(user.id))
        return await _build_auth_response(user, response, db)

    # 2. Check if User with matching email already exists
    user_res = await db.execute(select(User).where(User.email == clean_email))
    user = user_res.scalar_one_or_none()

    if not user:
        # Create new User
        user = User(
            email=clean_email,
            full_name=req.name.strip() if req.name else None,
            onboarding_completed=False,
        )
        db.add(user)
        await db.flush()
        logger.info("yullo_auth.user_created_google", user_id=str(user.id))

    # Link new AuthIdentity
    new_identity = AuthIdentity(
        user_id=user.id,
        provider="google",
        provider_subject=req.google_sub.strip(),
    )
    db.add(new_identity)
    await db.commit()
    await db.refresh(user)

    return await _build_auth_response(user, response, db)


@router.post("/phone/send-otp")
async def send_phone_otp(req: SendPhoneOtpRequest):
    """Sends a 6-digit OTP code to the normalized E.164 phone number."""
    try:
        normalized_phone = normalize_e164(req.phone, req.country_code or "+91")
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    try:
        code, cooldown = issue_otp(normalized_phone)
        from app.services.providers.sms.factory import dispatch_otp_sms
        await dispatch_otp_sms(normalized_phone, code, app_name="yullo")

        logger.info("yullo_auth.phone_otp_sent", phone=normalized_phone, code_dev=code)
        from app.config import settings
        res = {
            "ok": True,
            "phone_normalized": normalized_phone,
            "cooldown_seconds": cooldown,
        }
        if settings.ENVIRONMENT == "development":
            res["dev_code"] = code
        return res
    except ValueError as err:
        raise HTTPException(status_code=429, detail=str(err))


@router.post("/phone/verify-otp", response_model=AuthResponseData)
async def verify_phone_otp(req: VerifyPhoneOtpRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Verifies a 6-digit phone OTP and signs in or registers the User account."""
    try:
        normalized_phone = normalize_e164(req.phone, req.country_code or "+91")
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    valid = verify_otp(normalized_phone, req.code.strip())
    if not valid:
        raise HTTPException(status_code=400, detail="That code isn't correct. Try again.")

    # 1. Check if AuthIdentity exists for this phone number
    res = await db.execute(
        select(AuthIdentity).where(
            AuthIdentity.provider == "phone",
            AuthIdentity.provider_subject == normalized_phone
        )
    )
    identity = res.scalar_one_or_none()

    if identity:
        user_res = await db.execute(select(User).where(User.id == identity.user_id))
        user = user_res.scalar_one_or_none()
        if user:
            return await _build_auth_response(user, response, db)

    # 2. Check if User with phone exists
    user_res = await db.execute(select(User).where(User.phone == normalized_phone))
    user = user_res.scalar_one_or_none()

    if not user:
        user = User(
            phone=normalized_phone,
            onboarding_completed=False,
        )
        db.add(user)
        await db.flush()

    new_identity = AuthIdentity(
        user_id=user.id,
        provider="phone",
        provider_subject=normalized_phone,
    )
    db.add(new_identity)
    await db.commit()
    await db.refresh(user)

    return await _build_auth_response(user, response, db)


@router.post("/email/send-otp")
async def send_email_otp(req: SendEmailOtpRequest):
    """Sends a 6-digit OTP code to the requested email address."""
    clean_email = req.email.strip().lower()
    try:
        code, cooldown = issue_otp(clean_email)
        from app.services.providers.email.smtp_sender import dispatch_otp_email
        await dispatch_otp_email(clean_email, code, app_name="yullo")

        logger.info("yullo_auth.email_otp_sent", email=clean_email, code_dev=code)
        from app.config import settings
        res = {
            "ok": True,
            "email": clean_email,
            "cooldown_seconds": cooldown,
        }
        if settings.ENVIRONMENT == "development":
            res["dev_code"] = code
        return res
    except ValueError as err:
        raise HTTPException(status_code=429, detail=str(err))


@router.post("/email/verify-otp", response_model=AuthResponseData)
async def verify_email_otp(req: VerifyEmailOtpRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Verifies a 6-digit email OTP and signs in or registers the User account."""
    clean_email = req.email.strip().lower()

    valid = verify_otp(clean_email, req.code.strip())
    if not valid:
        raise HTTPException(status_code=400, detail="That code isn't correct. Try again.")

    # 1. Check if AuthIdentity exists for this email
    res = await db.execute(
        select(AuthIdentity).where(
            AuthIdentity.provider == "email",
            AuthIdentity.provider_subject == clean_email
        )
    )
    identity = res.scalar_one_or_none()

    if identity:
        user_res = await db.execute(select(User).where(User.id == identity.user_id))
        user = user_res.scalar_one_or_none()
        if user:
            return await _build_auth_response(user, response, db)

    # 2. Check if User with email exists
    user_res = await db.execute(select(User).where(User.email == clean_email))
    user = user_res.scalar_one_or_none()

    if not user:
        user = User(
            email=clean_email,
            onboarding_completed=False,
        )
        db.add(user)
        await db.flush()

    new_identity = AuthIdentity(
        user_id=user.id,
        provider="email",
        provider_subject=clean_email,
    )
    db.add(new_identity)
    await db.commit()
    await db.refresh(user)

    return await _build_auth_response(user, response, db)


from app.core.auth import current_user

@router.get("/me")
async def get_current_user_me(
    request: Request,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns the current user details, app preferences, and re-issues a CSRF token for the session."""
    from app.yullo.services.auth.session_service import resolve_yullo_session
    from app.models.yullo_user_preference import YulloUserPreference
    
    result = await resolve_yullo_session(db, request)
    if not result:
        raise HTTPException(status_code=401)
        
    _, session = result
    
    stmt = select(YulloUserPreference).where(YulloUserPreference.user_id == user.id)
    pref_res = await db.execute(stmt)
    preference = pref_res.scalar_one_or_none()
    app_theme = preference.app_theme if preference else "system"
    
    import secrets
    from app.yullo.services.auth.session_service import _hash_token
    new_csrf_token = secrets.token_hex(32)
    session.csrf_hash = _hash_token(new_csrf_token)
    await db.commit()
    
    return {
        "user": user.to_dict(),
        "preference": {"appTheme": app_theme},
        "csrf_token": new_csrf_token
    }


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """Revokes the current session and clears the cookie."""
    from app.yullo.services.auth.session_service import revoke_yullo_session
    await revoke_yullo_session(db, request, response)
    return {"ok": True}
