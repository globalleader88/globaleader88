"""Server-rendered admin dashboard (HTTP Basic protected)."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import Lead, LeadStatus, LeadTier
from ..services.offers import OFFERS

router = APIRouter(tags=["dashboard"])

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))


def _stats(db: Session) -> dict:
    total = db.scalar(select(func.count(Lead.id))) or 0
    dupes = db.scalar(
        select(func.count(Lead.id)).where(Lead.status == LeadStatus.duplicate)
    ) or 0
    by_tier = {t.value: 0 for t in LeadTier}
    for tier, count in db.execute(
        select(Lead.tier, func.count(Lead.id))
        .where(Lead.status != LeadStatus.duplicate)
        .group_by(Lead.tier)
    ):
        by_tier[tier.value if hasattr(tier, "value") else tier] = count
    avg_score = db.scalar(
        select(func.avg(Lead.score)).where(Lead.status != LeadStatus.duplicate)
    )
    return {
        "total": total,
        "active": total - dupes,
        "duplicates": dupes,
        "by_tier": by_tier,
        "avg_score": round(avg_score, 1) if avg_score is not None else 0.0,
    }


@router.get("/", response_class=HTMLResponse)
def dashboard(
    request: Request,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> HTMLResponse:
    stats = _stats(db)
    leads = db.execute(
        select(Lead)
        .where(Lead.status != LeadStatus.duplicate)
        .order_by(Lead.score.desc(), Lead.id.desc())
        .limit(200)
    ).scalars().all()
    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {"stats": stats, "leads": leads, "title": "Lead Engine — Dashboard"},
    )


@router.get("/leads/{lead_id}", response_class=HTMLResponse)
def lead_detail(
    lead_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> HTMLResponse:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return templates.TemplateResponse(
        request,
        "lead_detail.html",
        {"lead": lead, "offers_catalog": OFFERS, "title": f"Lead #{lead.id}"},
    )
