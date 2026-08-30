"""
app/integrations/whatsapp — Pluggable WhatsApp integration package
"""

from app.integrations.whatsapp.routes import router
from app.integrations.whatsapp.client import WhatsAppClient
from app.integrations.whatsapp.service import handle_incoming_whatsapp_message
