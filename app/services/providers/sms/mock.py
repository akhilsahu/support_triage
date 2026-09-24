"""
Mock SMS Provider for local development and testing.
Logs SMS content without incurring network or API charges.
"""

import structlog
from app.services.providers.sms.base import BaseSMSProvider

logger = structlog.get_logger()


class MockSMSProvider(BaseSMSProvider):
    async def send_sms(self, phone_e164: str, message: str, sender_id: str = "YULLO") -> bool:
        logger.info(
            "sms.mock_provider_dispatched",
            phone=phone_e164,
            sender_id=sender_id,
            message=message,
        )
        return True
