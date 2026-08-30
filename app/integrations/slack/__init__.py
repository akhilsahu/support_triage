"""
app/integrations/slack — Pluggable Slack integration package
"""

from app.integrations.slack.routes import router
from app.integrations.slack.client import SlackClient
from app.integrations.slack.service import trigger_slack_escalation_alert
