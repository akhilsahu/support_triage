"""
Multi-App Per-Domain SMTP Email Sender (Zoho / Custom SMTP Relays).
Handles email OTP dispatch for Yullo (yullo.co) and Support247 (support247.chat).
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import structlog
from app.config import settings

logger = structlog.get_logger()


async def dispatch_otp_email(to_email: str, code: str, app_name: str = "yullo") -> bool:
    """Sends server-handled email OTP using per-domain SMTP credentials."""
    app_key = app_name.lower().strip()

    if app_key == "support247":
        host = settings.SUPPORT247_SMTP_HOST
        port = settings.SUPPORT247_SMTP_PORT
        user = settings.SUPPORT247_SMTP_USER
        password = settings.SUPPORT247_SMTP_PASSWORD
        email_from = settings.SUPPORT247_EMAIL_FROM
        brand_name = "Support247"
    else:
        host = settings.YULLO_SMTP_HOST
        port = settings.YULLO_SMTP_PORT
        user = settings.YULLO_SMTP_USER
        password = settings.YULLO_SMTP_PASSWORD
        email_from = settings.YULLO_EMAIL_FROM
        brand_name = "Yullo"

    if not user or not password:
        logger.info("email.otp_dev_mode", app=brand_name, to=to_email, code=code)
        return True  # Local dev mode fallback (returns dev code in API response)

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"{code} is your {brand_name} verification code"
        msg["From"] = email_from
        msg["To"] = to_email

        text_content = f"Your {brand_name} verification code is: {code}\n\nThis code is valid for 5 minutes. Do not share it with anyone."
        html_content = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin-bottom: 12px;">{brand_name} Verification Code</h2>
            <p style="color: #475569; font-size: 14px; margin-bottom: 24px;">Use the following 6-digit code to complete your authentication:</p>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #0f172a;">
                {code}
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">This code is valid for 5 minutes. If you did not request this code, please ignore this email.</p>
        </div>
        """

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(email_from, [to_email], msg.as_string())

        logger.info("email.otp_sent_success", app=brand_name, to=to_email)
        return True
    except Exception as err:
        logger.error("email.otp_sent_failed", app=brand_name, to=to_email, error=str(err))
        return False
