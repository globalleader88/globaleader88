"""Public website webhook.

The static GovCon assessment site (js/assessment.js -> ``leadEndpoint``) POSTs
completed leads here as JSON. Authenticated with the shared webhook secret so no
login is needed from the browser/CRM.

It accepts the assessment site's native shape *and* a flat lead shape, mapping
common field aliases so integrators don't have to reshape their payload.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..auth import require_webhook_secret
from ..config import get_settings
from ..database import get_db
from ..schemas import IntakeResult, LeadCreate, LeadOut
from ..services import intake

router = APIRouter(prefix="/webhook", tags=["webhook"])
settings = get_settings()

# Map inbound alias keys -> our canonical field names.
_ALIASES = {
    "name": "full_name",
    "fullname": "full_name",
    "firstname": "first_name",
    "lastname": "last_name",
    "phone_number": "phone",
    "telephone": "phone",
    "organization": "company",
    "org": "company",
    "title": "job_title",
    "role": "job_title",
    "site": "website",
    "url": "website",
    "utm_source": "source",
    "utm_campaign": "campaign",
    "score": "readiness_score",
    "readinessScore": "readiness_score",
    "tier": "readiness_tier",
}


def _normalize_payload(raw: dict[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    extras: dict[str, Any] = {}

    for key, value in raw.items():
        canonical = _ALIASES.get(key, key)
        data[canonical] = value

    # Split a single "full_name" into first/last if names weren't given.
    full = data.pop("full_name", None)
    if full and not data.get("first_name") and not data.get("last_name"):
        parts = str(full).strip().split()
        if parts:
            data["first_name"] = parts[0]
            data["last_name"] = " ".join(parts[1:]) or None

    # Preserve the raw assessment breakdown if the funnel sent one.
    if "assessment" not in data:
        for k in ("categories", "breakdown", "answers", "results"):
            if k in raw:
                extras[k] = raw[k]
    if extras:
        data["assessment"] = {**(data.get("assessment") or {}), **extras}

    # Keep only fields our schema knows; stash the rest into assessment.
    known = set(LeadCreate.model_fields.keys())
    unknown = {k: v for k, v in data.items() if k not in known}
    clean = {k: v for k, v in data.items() if k in known}
    if unknown:
        clean["assessment"] = {**(clean.get("assessment") or {}), "extra": unknown}
    return clean


@router.post("/lead", response_model=IntakeResult, dependencies=[Depends(require_webhook_secret)])
async def website_lead(
    request: Request,
    db: Session = Depends(get_db),
) -> IntakeResult:
    raw = await request.json()
    if not isinstance(raw, dict):
        raw = {"assessment": {"payload": raw}}
    normalized = _normalize_payload(raw)
    payload = LeadCreate.model_validate(normalized)

    lead, is_dupe = intake.process_lead(
        db, payload.model_dump(exclude_none=True),
        dedup_threshold=settings.dedup_threshold,
    )
    return IntakeResult(
        lead=LeadOut.model_validate(lead),
        is_duplicate=is_dupe,
        duplicate_of_id=lead.duplicate_of_id,
        score=lead.score,
        tier=lead.tier.value,
        recommended_offers=lead.recommended_offers or [],
    )
