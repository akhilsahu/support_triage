"""
SMS Provider Factory & Country Router.
Routes SMS dispatch based on destination prefix (+91 India vs Global) and brand app context.
"""

import structlog
from app.config import settings
from app.services.providers.sms.base import BaseSMSProvider
from app.services.providers.sms.mock import MockSMSProvider
from app.services.providers.sms.twilio import TwilioSMSProvider
from app.services.providers.sms.fast2sms import Fast2SMSSMSProvider
from app.services.providers.sms.msg91 import MSG91SMSProvider

logger = structlog.get_logger()


def get_sms_provider(phone_e164: str) -> BaseSMSProvider:
    """Selects active SMS provider based on destination country prefix and configuration."""
    if phone_e164.startswith("+91"):
        provider_type = settings.SMS_PROVIDER_INDIA.lower()
    else:
        provider_type = settings.SMS_PROVIDER_GLOBAL.lower()

    if provider_type == "twilio":
        return TwilioSMSProvider()
    elif provider_type == "fast2sms":
        return Fast2SMSSMSProvider()
    elif provider_type == "msg91":
        return MSG91SMSProvider()

    return MockSMSProvider()


async def dispatch_otp_sms(phone_e164: str, code: str, app_name: str = "yullo") -> bool:
    """Formats brand-aware OTP message and dispatches via configured SMS provider."""
    app_key = app_name.lower().strip()

    if app_key == "support247":
        brand_name = "Support247"
        sender_id = settings.SUPPORT247_SMS_SENDER_ID
    else:
        brand_name = "Yullo"
        sender_id = settings.YULLO_SMS_SENDER_ID

    message = f"Your {brand_name} verification code is {code}. Valid for 5 minutes."

    provider = get_sms_provider(phone_e164)
    logger.info("sms.dispatching_otp", app=brand_name, phone=phone_e164, provider=provider.__class__.__name__)
    return await provider.send_sms(phone_e164, message, sender_id=sender_id)
