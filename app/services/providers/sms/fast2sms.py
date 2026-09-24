"""
Fast2SMS Provider Implementation for Dedicated Fast2SMS OTP API (/dev/otp/send).
Supports sending custom OTP codes via Fast2SMS DLT-approved templates.
"""

import structlog
import json
import urllib.request
from app.config import settings
from app.services.providers.sms.base import BaseSMSProvider

logger = structlog.get_logger()


class Fast2SMSSMSProvider(BaseSMSProvider):
    async def send_sms(self, phone_e164: str, message: str, sender_id: str = "YULLO") -> bool:
        """
        Dispatches an OTP SMS via Fast2SMS API.
        
        Uses dedicated /dev/otp/send if FAST2SMS_OTP_ID is configured in settings,
        otherwise falls back to /dev/bulkV2.
        
        Args:
            phone_e164: Target phone number in E.164 format (e.g., +919999999999).
            message: The full SMS message or OTP code.
            sender_id: The 6-character sender ID header.
            
        Returns:
            bool: True if OTP message dispatched successfully, False otherwise.
        """
        api_key = settings.FAST2SMS_API_KEY
        if not api_key:
            logger.warning("sms.fast2sms_missing_api_key", phone=phone_e164)
            return False

        # Extract 10-digit Indian mobile number (e.g. +919876543210 -> 9876543210)
        raw_number = phone_e164.replace("+91", "").replace("+", "").strip()

        # Extract pure numeric OTP from message if message contains text
        digits_only = "".join(filter(str.isdigit, message))
        otp_code = digits_only if len(digits_only) in (4, 6) else message

        try:
            if settings.FAST2SMS_OTP_ID:
                # Dedicated Fast2SMS OTP API endpoint (/dev/otp/send)
                url = "https://www.fast2sms.com/dev/otp/send"
                payload_dict = {
                    "mobile": raw_number,
                    "otp_id": settings.FAST2SMS_OTP_ID,
                    "otp": otp_code,
                    "variables_values": otp_code,
                }
                logger.info(
                    "sms.fast2sms_sending_otp",
                    endpoint="/dev/otp/send",
                    phone=phone_e164,
                    otp_id=settings.FAST2SMS_OTP_ID,
                )
            else:
                # Fallback to Bulk SMS API V2 (/dev/bulkV2) if OTP ID is not configured
                url = "https://www.fast2sms.com/dev/bulkV2"
                payload_dict = {
                    "route": "v3",
                    "sender_id": sender_id[:6],
                    "message": message,
                    "language": "english",
                    "flash": 0,
                    "numbers": raw_number,
                }
                logger.info(
                    "sms.fast2sms_sending_bulkv2",
                    endpoint="/dev/bulkV2",
                    phone=phone_e164,
                )

            payload = json.dumps(payload_dict).encode("utf-8")
            req = urllib.request.Request(url, data=payload, method="POST")
            req.add_header("authorization", api_key)
            req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=10) as resp:
                response_bytes = resp.read()
                response_data = json.loads(response_bytes.decode("utf-8"))

                if resp.status == 200 and response_data.get("return") is True:
                    logger.info(
                        "sms.fast2sms_dispatched_success",
                        phone=phone_e164,
                        request_id=response_data.get("request_id"),
                        message=response_data.get("message"),
                    )
                    return True

                logger.error(
                    "sms.fast2sms_failed",
                    status=resp.status,
                    phone=phone_e164,
                    response=response_data,
                )
                return False

        except Exception as err:
            logger.error("sms.fast2sms_exception", error=str(err), phone=phone_e164)
            return False
