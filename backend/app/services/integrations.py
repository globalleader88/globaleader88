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
from ..models import Lead, LeadEvent

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


# --- Provider registries -----------------------------------------------
# Real providers register here in later increments, e.g.
# _CRM_PROVIDERS["gohighlevel"] = GoHighLevelCRM.
_CRM_PROVIDERS: dict[str, type] = {"none": NullCRM, "log": NullCRM}
_EMAIL_PROVIDERS: dict[str, type] = {"none": NullEmail, "log": NullEmail}
_ENRICH_PROVIDERS: dict[str, type] = {"none": NullEnricher, "log": NullEnricher}


def get_notifier() -> Notifier:
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
    Called from ``intake.process_lead`` (the single intake path).
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
