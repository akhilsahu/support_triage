"""
Abstract Base SMS Provider Interface.
"""

from abc import ABC, abstractmethod


class BaseSMSProvider(ABC):
    @abstractmethod
    async def send_sms(self, phone_e164: str, message: str, sender_id: str = "YULLO") -> bool:
        """Dispatches an SMS message to a normalized E.164 phone number."""
        pass
