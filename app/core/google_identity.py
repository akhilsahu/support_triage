"""Verify Google credentials independently of product account/session models."""
import structlog
from fastapi import HTTPException
from app.config import settings

logger = structlog.get_logger()


def verify_google_id_token(id_token_str: str, client_id: str | None = None) -> dict:
    audience = settings.GOOGLE_CLIENT_ID if client_id is None else client_id
    if not audience:
        raise HTTPException(503, 'Google sign-in is not configured on this server.')
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
        info = id_token.verify_oauth2_token(id_token_str, google_requests.Request(), audience)
    except ImportError:
        raise HTTPException(503, 'Google sign-in is unavailable.')
    except Exception as error:
        logger.warning('identity.google_verify_failed', error_type=type(error).__name__)
        raise HTTPException(401, 'Could not verify Google sign-in.')
    if (info.get('iss') not in ('accounts.google.com', 'https://accounts.google.com')
            or info.get('email_verified') is not True or not info.get('sub') or not info.get('email')):
        raise HTTPException(401, 'Could not verify Google sign-in.')
    return {'sub': info['sub'], 'email': info['email'], 'name': info.get('name'), 'picture': info.get('picture')}
