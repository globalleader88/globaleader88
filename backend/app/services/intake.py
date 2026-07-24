"""Intake orchestration: dedup -> score -> recommend -> persist.

This is the single code path used by the intake API, the website webhook, and
CSV import, so every lead is handled identically no matter how it arrives.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models import Lead, LeadEvent, LeadStatus, LeadTier
from . import dedup, offers, scoring


def _log(db: Session, lead: Lead, kind: str, message: str) -> None:
    db.add(LeadEvent(lead=lead, kind=kind, message=message))


def process_lead(
    db: Session, payload: dict[str, Any], *, dedup_threshold: int = 85
) -> tuple[Lead, bool]:
    """Create (or flag) a lead from ``payload``.

    Returns ``(lead, is_duplicate)``. On duplicate, the returned lead is a new
    record linked to the original via ``duplicate_of_id`` and marked with the
    ``duplicate`` status — the original is never overwritten, preserving history.
    """
    existing = dedup.find_duplicate(db, payload, threshold=dedup_threshold)

    scoring_result = scoring.score_lead(payload)
    offer_list = offers.recommend_offers(payload, scoring_result["score"])

    # Only keep known model columns from the payload.
    columns = {c.name for c in Lead.__table__.columns}
    fields = {k: v for k, v in payload.items() if k in columns}

    lead = Lead(**fields)
    lead.score = scoring_result["score"]
    lead.tier = LeadTier(scoring_result["tier"])
    lead.score_breakdown = scoring_result["breakdown"]
    lead.recommended_offers = offer_list

    is_duplicate = existing is not None
    if is_duplicate:
        lead.status = LeadStatus.duplicate
        lead.duplicate_of_id = existing.id

    db.add(lead)
    db.flush()  # assign lead.id

    _log(db, lead, "intake", f"Lead created from source={payload.get('source') or 'n/a'}")
    _log(
        db,
        lead,
        "scored",
        f"score={lead.score} tier={lead.tier.value} "
        f"breakdown={scoring_result['breakdown']}",
    )
    if is_duplicate:
        _log(
            db,
            lead,
            "duplicate",
            f"Flagged as duplicate of lead #{existing.id}",
        )

    db.commit()
    db.refresh(lead)
    return lead, is_duplicate
