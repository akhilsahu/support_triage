"""
Email notifications for escalated sessions.

Sends a simple email to the space's notification_email when:
- A session is escalated and no staff is immediately available (queued)
- A session is assigned to a staff member (optional confirmation)

Uses Python's built-in smtplib. Configure via settings:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
"""

from __future__ import annotations

import smtplib
import structlog
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = structlog.get_logger()


def _get_smtp_settings():
    from app.config import settings
    return {
        "host": getattr(settings, "SMTP_HOST", ""),
        "port": getattr(settings, "SMTP_PORT", 587),
        "user": getattr(settings, "SMTP_USER", ""),
        "password": getattr(settings, "SMTP_PASS", ""),
        "from_addr": getattr(settings, "SMTP_FROM", "noreply@support247.chat"),
    }


def _send_email(to: str, subject: str, body_html: str, dev_url: str | None = None) -> None:
    """Send email via SMTP. In dev mode, prints the action URL to console if SMTP is unavailable."""
    from app.config import settings
    is_dev = settings.ENVIRONMENT.lower() == "development"

    cfg = _get_smtp_settings()
    if not cfg["host"] or not cfg["user"]:
        logger.warning("email.smtp_not_configured", to=to, subject=subject)
        if is_dev and dev_url:
            _dev_print(dev_url, reason="SMTP not configured")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = cfg["from_addr"]
    msg["To"]      = to
    msg.attach(MIMEText(body_html, "html"))

    try:
        if cfg["port"] == 465:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"]) as server:
                server.login(cfg["user"], cfg["password"])
                server.sendmail(cfg["from_addr"], to, msg.as_string())
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
                server.starttls()
                server.login(cfg["user"], cfg["password"])
                server.sendmail(cfg["from_addr"], to, msg.as_string())
        logger.info("email.sent", to=to, subject=subject)
    except Exception as e:
        logger.error(
            "email.send_failed",
            to=to,
            subject=subject,
            smtp_host=cfg["host"],
            smtp_port=cfg["port"],
            error=str(e),
            error_type=type(e).__name__,
        )
        if is_dev and dev_url:
            _dev_print(dev_url, reason=str(e))


def _dev_print(url: str, reason: str) -> None:
    """Print a clickable URL to stdout during local development when email can't be sent."""
    logger.warning("email.dev_fallback", url=url, reason=reason)
    print(f"\n{'='*70}\n[DEV] Email not sent ({reason})\nOpen this URL in your browser:\n\n  {url}\n{'='*70}\n", flush=True)


def send_verification_email(to: str, verify_url: str) -> None:
    body = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#6366f1">Verify your email</h2>
      <p>Thanks for signing up for SUPPORT247.chat! Click below to verify your email and activate your account.</p>
      <p style="margin:28px 0">
        <a href="{verify_url}"
           style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:99px;text-decoration:none;font-weight:bold;font-size:14px">
          Verify Email
        </a>
      </p>
      <p style="color:#888;font-size:13px">If you didn't sign up for SUPPORT247.chat, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#bbb;font-size:11px">SUPPORT247.chat · Automated notification</p>
    </div>
    """
    _send_email(to=to, subject="Verify your SUPPORT247.chat email", body_html=body, dev_url=verify_url)


def send_password_reset_email(to: str, reset_url: str) -> None:
    body = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#6366f1">Reset your password</h2>
      <p>You requested a password reset for your SUPPORT247.chat account.</p>
      <p>Click the button below to choose a new password. This link expires in 30 minutes.</p>
      <p style="margin:28px 0">
        <a href="{reset_url}"
           style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:99px;text-decoration:none;font-weight:bold;font-size:14px">
          Reset Password
        </a>
      </p>
      <p style="color:#888;font-size:13px">If you didn't request this, you can ignore this email — your password won't change.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#bbb;font-size:11px">SUPPORT247.chat · Automated notification</p>
    </div>
    """
    _send_email(to=to, subject="Reset your SUPPORT247.chat password", body_html=body, dev_url=reset_url)


async def send_escalation_email(session, rule) -> None:
    """
    Notify the space's support email that a customer is waiting.
    session: ChatSession model instance
    rule:    SpaceAssignmentRule model instance
    """
    if not rule or not rule.notification_email:
        return

    title = session.title or f"Session {str(session.id)[:8]}"
    inbox_url = f"https://app.support247.chat/inbox/{session.id}"

    body = f"""
    <h2>Customer waiting for support</h2>
    <p>A customer has been placed in the queue and needs human assistance.</p>
    <table>
      <tr><td><strong>Session:</strong></td><td>{title}</td></tr>
      <tr><td><strong>Reason:</strong></td><td>{session.escalation_reason or 'escalation'}</td></tr>
      <tr><td><strong>Time:</strong></td><td>{session.escalated_at}</td></tr>
    </table>
    <p><a href="{inbox_url}">Open in Inbox →</a></p>
    <hr>
    <p style="color:#999;font-size:12px">Support247 · Automated notification</p>
    """

    _send_email(
        to=rule.notification_email,
        subject=f"[Support247] Customer waiting — {title}",
        body_html=body,
    )
