"""
app/integrations/stripe — Pluggable Stripe integration package
"""

from app.integrations.stripe.routes import router
from app.integrations.stripe.client import StripeClient
from app.integrations.stripe.service import execute_customer_refund, process_invoice_paid
