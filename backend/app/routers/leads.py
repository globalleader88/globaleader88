"""Management API for leads (admin-authenticated)."""
from __future__ import annotations

import io

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..config import get_settings
from ..database import get_db
from ..models import Lead, LeadStatus
from ..schemas import (
    ImportSummary,
    IntakeResult,
    LeadCreate,
    LeadOut,
    LeadUpdate,
)
from ..services import csv_io, intake

router = APIRouter(prefix="/api/leads", tags=["leads"])
settings = get_settings()


@router.post("", response_model=IntakeResult, status_code=status.HTTP_201_CREATED)
def create_lead(
    payload: LeadCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> IntakeResult:
    """Manually create a lead (runs the full scoring + dedup pipeline)."""
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


@router.get("", response_model=list[LeadOut])
def list_leads(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
    tier: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    include_duplicates: bool = False,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
) -> list[Lead]:
    stmt = select(Lead)
    if not include_duplicates:
        stmt = stmt.where(Lead.status != LeadStatus.duplicate)
    if tier:
        stmt = stmt.where(Lead.tier == tier)
    if status_filter:
        stmt = stmt.where(Lead.status == status_filter)
    stmt = stmt.order_by(Lead.score.desc(), Lead.id.desc()).limit(limit).offset(offset)
    return list(db.execute(stmt).scalars().all())


@router.get("/export.csv")
def export_csv(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> StreamingResponse:
    data = csv_io.export_leads(db)
    return StreamingResponse(
        io.StringIO(data),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"},
    )


@router.post("/import", response_model=ImportSummary)
async def import_csv(
    file: UploadFile,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> ImportSummary:
    raw = await file.read()
    text = raw.decode("utf-8-sig")  # tolerate Excel BOM
    summary = csv_io.import_leads(db, text, dedup_threshold=settings.dedup_threshold)
    return ImportSummary(**summary)


@router.get("/{lead_id}", response_model=LeadOut)
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> Lead:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> Lead:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    data = payload.model_dump(exclude_none=True)
    if "status" in data:
        try:
            data["status"] = LeadStatus(data["status"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid status: {exc}") from exc
    for key, value in data.items():
        setattr(lead, key, value)
    db.commit()
    db.refresh(lead)
    return lead
