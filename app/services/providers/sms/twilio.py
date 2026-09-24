"""
Twilio SMS Provider Implementation for Global Delivery.
"""

import structlog
import urllib.parse
import urllib.request
import base64
from app.config import settings
from app.services.providers.sms.base import BaseSMSProvider

logger = structlog.get_logger()


class TwilioSMSProvider(BaseSMSProvider):
    async def send_sms(self, phone_e164: str, message: str, sender_id: str = "YULLO") -> bool:
        account_sid = settings.TWILIO_ACCOUNT_SID
        auth_token = settings.TWILIO_AUTH_TOKEN
        from_number = settings.TWILIO_PHONE_NUMBER or sender_id

        if not account_sid or not auth_token:
            logger.warning("sms.twilio_missing_credentials", phone=phone_e164)
            return False

        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
            data = urllib.parse.urlencode({
                "To": phone_e164,
                "From": from_number,
                "Body": message,
            }).encode("utf-8")

            req = urllib.request.Request(url, data=data, method="POST")
            auth_header = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("utf-8")
            req.add_header("Authorization", f"Basic {auth_header}")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")

            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 201):
                    logger.info("sms.twilio_dispatched_success", phone=phone_e164)
                    return True
                logger.error("sms.twilio_failed", status=resp.status)
                return False
        except Exception as err:
            logger.error("sms.twilio_exception", error=str(err), phone=phone_e164)
            return False
