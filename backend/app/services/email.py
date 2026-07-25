"""SMTP email transport (Phase 2, increment 4).

A thin stdlib ``smtplib`` wrapper — no new dependency. Works with any SMTP
provider (Gmail, Amazon SES SMTP, Mailgun, Postmark, …). Kept separate from the
integration adapters so the transport can be mocked in tests and swapped for an
API-based provider later behind the same ``send_email`` call.
"""
from __future__ import annotations

import smtplib
from email.message import EmailMessage

from ..config import get_settings

settings = get_settings()


def is_configured() -> bool:
    return bool(settings.smtp_host)


def send_email(subject: str, body: str, to: list[str]) -> None:
    """Send a plaintext email. Raises if SMTP isn't configured or the send fails."""
    if not settings.smtp_host:
        raise RuntimeError("SMTP is not configured (SMTP_HOST unset)")
    if not to:
        raise ValueError("no recipients")

    msg = EmailMessage()
    msg["From"] = settings.email_from
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(
        settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
    ) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password or "")
        server.send_message(msg)
