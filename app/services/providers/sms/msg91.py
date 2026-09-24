"""
MSG91 SMS Provider Implementation for India Delivery.
"""

import structlog
import json
import urllib.request
from app.config import settings
from app.services.providers.sms.base import BaseSMSProvider

logger = structlog.get_logger()


class MSG91SMSProvider(BaseSMSProvider):
    async def send_sms(self, phone_e164: str, message: str, sender_id: str = "YULLO") -> bool:
        auth_key = settings.MSG91_AUTH_KEY
        if not auth_key:
            logger.warning("sms.msg91_missing_auth_key", phone=phone_e164)
            return False

        clean_number = phone_e164.replace("+", "").strip()

        try:
            url = "https://api.msg91.com/api/v2/sendsms"
            payload = json.dumps({
                "sender": sender_id[:6],
                "route": "4",
                "country": "91",
                "sms": [
                    {
                        "message": message,
                        "to": [clean_number],
                    }
                ]
            }).encode("utf-8")

            req = urllib.request.Request(url, data=payload, method="POST")
            req.add_header("authkey", auth_key)
            req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    logger.info("sms.msg91_dispatched_success", phone=phone_e164)
                    return True
                logger.error("sms.msg91_failed", status=resp.status)
                return False
        except Exception as err:
            logger.error("sms.msg91_exception", error=str(err), phone=phone_e164)
            return False
