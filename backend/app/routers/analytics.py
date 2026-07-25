"""Analytics API (Phase 2). Requires the ``analytics:read`` scope or admin."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_api_scope
from ..database import get_db
from ..schemas import AnalyticsSummary
from ..services import analytics

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
def analytics_summary(
    db: Session = Depends(get_db),
    _: str = Depends(require_api_scope("analytics:read")),
) -> AnalyticsSummary:
    return AnalyticsSummary(**analytics.summary(db))
