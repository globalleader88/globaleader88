"""Prospect Finder API (admin-authenticated). Phase 3, demand generation."""
from __future__ import annotations

import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from ..auth import require_admin
from ..services import prospecting
from ..services.prospecting import ICP

router = APIRouter(prefix="/api/prospects", tags=["prospects"])


def _build_icp(
    naics: str | None, state: str | None, max_award: float, limit: int
) -> ICP:
    icp = ICP()
    if naics:
        icp.naics_codes = [c.strip() for c in naics.split(",") if c.strip()]
    icp.state = (state or None)
    icp.max_award_amount = max_award
    icp.limit = limit
    return icp


@router.get("/find")
def find(
    _: str = Depends(require_admin),
    naics: str | None = Query(default=None, description="Comma-separated NAICS codes"),
    state: str | None = Query(default=None, description="2-letter state, e.g. GA"),
    max_award: float = Query(default=500_000, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    campaign: str = Query(default="govcon"),
) -> dict:
    icp = _build_icp(naics, state, max_award, limit)
    prospects = prospecting.find_prospects(icp, campaign=campaign)
    return {
        "count": len(prospects),
        "source": prospecting.settings.prospecting_source,
        "prospects": [p.__dict__ for p in prospects],
    }


@router.get("/find.csv")
def find_csv(
    _: str = Depends(require_admin),
    naics: str | None = Query(default=None),
    state: str | None = Query(default=None),
    max_award: float = Query(default=500_000, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    campaign: str = Query(default="govcon"),
) -> StreamingResponse:
    icp = _build_icp(naics, state, max_award, limit)
    prospects = prospecting.find_prospects(icp, campaign=campaign)
    data = prospecting.to_csv(prospects)
    return StreamingResponse(
        io.StringIO(data),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=prospects.csv"},
    )
