"""Integration seams for Phase 2 (CRM, email, enrichment, notifications).

Phase 1 forbade external integrations in-line; Phase 2 introduces them *behind
clean interfaces*. This module defines those interfaces and ships safe default
implementations that make **no external calls** — they record a ``LeadEvent`` so
the action is observable and testable. Real providers (GoHighLevel, SendGrid,
etc.) implement the same Protocols and are selected via settings, so the intake
path never changes when one is added.

The post-intake dispatch is called once, from the single intake path, after a
lead is persisted. Today it runs synchronously; Phase 2 later increments can
swap ``dispatch_post_intake`` onto a background queue without touching callers.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal
from ..models import Lead, LeadEvent
from .jobs import enqueue

settings = get_settings()


def _log(db: Session, lead: Lead, kind: str, message: str) -> None:
    db.add(LeadEvent(lead=lead, kind=kind, message=message))


# --- Provider interfaces ------------------------------------------------
@runtime_checkable
class Notifier(Protocol):
    def notify_hot_lead(self, db: Session, lead: Lead) -> None: ...


@runtime_checkable
class CRMSync(Protocol):
    def sync_lead(self, db: Session, lead: Lead) -> None: ...


@runtime_checkable
class EmailSender(Protocol):
    def send_welcome(self, db: Session, lead: Lead) -> None: ...


@runtime_checkable
class Enricher(Protocol):
    def enrich(self, db: Session, lead: Lead) -> None: ...


# --- Default (self-contained) implementations ---------------------------
class LoggingNotifier:
    def notify_hot_lead(self, db: Session, lead: Lead) -> None:
        _log(db, lead, "notify", f"Hot lead alert queued (score={lead.score})")


class NullCRM:
    """Records intent to sync but makes no external call."""

    def sync_lead(self, db: Session, lead: Lead) -> None:
        _log(db, lead, "crm_sync", "CRM sync skipped (provider=none)")


class NullEmail:
    def send_welcome(self, db: Session, lead: Lead) -> None:
        _log(db, lead, "email", "Welcome email skipped (provider=none)")


class NullEnricher:
    def enrich(self, db: Session, lead: Lead) -> None:  # noqa: ARG002
        return None


# --- First real provider: generic outbound webhook CRM ------------------
def _lead_payload(lead: Lead) -> dict:
    """A stable, provider-agnostic representation of a lead for outbound sync."""
    return {
        "id": lead.id,
        "first_name": lead.first_name,
        "last_name": lead.last_name,
        "email": lead.email,
        "phone": lead.phone,
        "company": lead.company,
        "job_title": lead.job_title,
        "source": lead.source,
        "campaign": lead.campaign,
        "score": lead.score,
        "tier": lead.tier.value if lead.tier else None,
        "status": lead.status.value if lead.status else None,
        "readiness_score": lead.readiness_score,
        "recommended_offers": lead.recommended_offers,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
    }


class OutboundWebhookCRM:
    """Posts each new lead to a configurable URL (Zapier/Make/CRM inbound hook).

    This is a *real* integration but needs only a URL — no proprietary SDK — so
    it works with GoHighLevel/HubSpot/Zapier/Make inbound webhooks out of the
    box. It runs through the seam and the job queue, so it never touches the
    request path directly. Disabled unless ``CRM_PROVIDER=webhook`` and
    ``CRM_WEBHOOK_URL`` are set.
    """

    def sync_lead(self, db: Session, lead: Lead) -> None:
        url = settings.crm_webhook_url
        if not url:
            _log(db, lead, "crm_sync", "CRM webhook skipped (no CRM_WEBHOOK_URL)")
            return
        import httpx

        resp = httpx.post(
            url, json=_lead_payload(lead), timeout=settings.crm_webhook_timeout_seconds
        )
        resp.raise_for_status()
        _log(db, lead, "crm_sync", f"CRM webhook posted (HTTP {resp.status_code})")


# --- Real provider: SMTP email -----------------------------------------
def _lead_summary(lead: Lead) -> str:
    offers = lead.recommended_offers or []
    top = offers[0]["name"] if offers else "—"
    return (
        f"Name:    {lead.full_name}\n"
        f"Company: {lead.company or '—'}\n"
        f"Email:   {lead.email or '—'}\n"
        f"Phone:   {lead.phone or '—'}\n"
        f"Score:   {lead.score} ({lead.tier.value if lead.tier else '—'})\n"
        f"Source:  {lead.source or '—'}\n"
        f"Top offer: {top}\n"
    )


class SmtpAlertNotifier:
    """Emails the sales team when a hot lead arrives (EMAIL_PROVIDER=smtp)."""

    def notify_hot_lead(self, db: Session, lead: Lead) -> None:
        from . import email as email_mod

        recipients = settings.hot_lead_alert_recipients
        if not email_mod.is_configured() or not recipients:
            _log(db, lead, "notify", "Hot-lead alert skipped (SMTP/recipients unset)")
            return
        subject = f"🔥 Hot GovCon lead: {lead.full_name} ({lead.company or 'n/a'}) — score {lead.score}"
        email_mod.send_email(subject, _lead_summary(lead), recipients)
        _log(db, lead, "notify", f"Hot-lead alert emailed to {len(recipients)} recipient(s)")


class SmtpEmailSender:
    """Sends a welcome email to the prospect on intake (opt-in via SEND_WELCOME_EMAIL)."""

    def send_welcome(self, db: Session, lead: Lead) -> None:
        from . import email as email_mod

        if not settings.send_welcome_email:
            _log(db, lead, "email", "Welcome email disabled (SEND_WELCOME_EMAIL=false)")
            return
        if not email_mod.is_configured() or not lead.email:
            _log(db, lead, "email", "Welcome email skipped (SMTP unset or no lead email)")
            return
        subject = "Thanks for your Federal Contracting Readiness Assessment"
        body = (
            f"Hi {lead.first_name or 'there'},\n\n"
            "Thanks for completing your Federal Contracting Readiness Assessment. "
            "A GovCon advisor will be in touch shortly with your tailored next steps.\n\n"
            "— The Global Connects Services\n"
        )
        email_mod.send_email(subject, body, [lead.email])
        _log(db, lead, "email", f"Welcome email sent to {lead.email}")


# --- Real provider: HTTP enrichment ------------------------------------
# Firmographic fields an enrichment service may fill in. We only ever populate
# fields the lead is *missing* — enrichment augments, it never overwrites.
_ENRICHABLE_FIELDS = ("industry", "employees", "annual_revenue", "website", "job_title")


class HttpEnricher:
    """Enriches a lead from a configurable HTTP endpoint (ENRICHMENT_PROVIDER=webhook).

    POSTs the lead to ``ENRICHMENT_WEBHOOK_URL`` and expects a JSON object back
    with any of the enrichable firmographic fields. Like the outbound CRM, this
    needs only a URL — point it at Clearbit-via-Zapier, your own service, etc.
    Runs through the seam and job queue; failures never break intake.
    """

    def enrich(self, db: Session, lead: Lead) -> None:
        url = settings.enrichment_webhook_url
        if not url:
            _log(db, lead, "enrich", "Enrichment skipped (no ENRICHMENT_WEBHOOK_URL)")
            return
        import httpx

        resp = httpx.post(
            url,
            json=_lead_payload(lead),
            timeout=settings.enrichment_webhook_timeout_seconds,
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            _log(db, lead, "enrich", "Enrichment response was not a JSON object; ignored")
            return

        filled: list[str] = []
        for field in _ENRICHABLE_FIELDS:
            incoming = data.get(field)
            current = getattr(lead, field, None)
            # Only fill fields that are currently empty (never overwrite).
            if incoming is not None and current in (None, "", 0):
                setattr(lead, field, incoming)
                filled.append(field)
        _log(db, lead, "enrich", f"Enriched fields: {filled or 'none'}")


# --- Provider registries -----------------------------------------------
# Real providers register here in later increments, e.g.
# _CRM_PROVIDERS["gohighlevel"] = GoHighLevelCRM.
_CRM_PROVIDERS: dict[str, type] = {
    "none": NullCRM,
    "log": NullCRM,
    "webhook": OutboundWebhookCRM,
}
_EMAIL_PROVIDERS: dict[str, type] = {
    "none": NullEmail,
    "log": NullEmail,
    "smtp": SmtpEmailSender,
}
_ENRICH_PROVIDERS: dict[str, type] = {
    "none": NullEnricher,
    "log": NullEnricher,
    "webhook": HttpEnricher,
}


def get_notifier() -> Notifier:
    # When email is the SMTP provider, hot-lead alerts go out as email; otherwise
    # they're recorded as an audit event only.
    if settings.email_provider == "smtp":
        return SmtpAlertNotifier()
    return LoggingNotifier()


def get_crm() -> CRMSync:
    return _CRM_PROVIDERS.get(settings.crm_provider, NullCRM)()


def get_email() -> EmailSender:
    return _EMAIL_PROVIDERS.get(settings.email_provider, NullEmail)()


def get_enricher() -> Enricher:
    return _ENRICH_PROVIDERS.get(settings.enrichment_provider, NullEnricher)()


# --- Post-intake dispatch ----------------------------------------------
def dispatch_post_intake(db: Session, lead: Lead, is_duplicate: bool) -> None:
    """Run integration side effects for a freshly-ingested lead.

    Kept deliberately defensive: a failing integration must never break intake.
    This is the worker body; it is invoked via the job queue (see
    ``run_post_intake_job``) from the single intake path.
    """
    # Duplicates don't re-trigger outbound side effects.
    if is_duplicate:
        return

    try:
        get_enricher().enrich(db, lead)
        get_crm().sync_lead(db, lead)
        get_email().send_welcome(db, lead)
        if lead.score >= settings.hot_lead_notify_threshold:
            get_notifier().notify_hot_lead(db, lead)
        db.commit()
    except Exception as exc:  # noqa: BLE001 - integrations must not break intake
        db.rollback()
        _log(db, lead, "integration_error", f"Post-intake dispatch failed: {exc}")
        db.commit()


def run_post_intake_job(lead_id: int, is_duplicate: bool) -> None:
    """Job entrypoint: open a fresh session and dispatch side effects.

    Runs synchronously (inline queue) or on a background thread (thread queue).
    Always uses its own session so it is safe off the request path.
    """
    db = SessionLocal()
    try:
        lead = db.get(Lead, lead_id)
        if lead is not None:
            dispatch_post_intake(db, lead, is_duplicate)
    finally:
        db.close()


def enqueue_post_intake(lead: Lead, is_duplicate: bool) -> None:
    """Submit the post-intake dispatch to the configured job queue."""
    enqueue(run_post_intake_job, lead.id, is_duplicate)
