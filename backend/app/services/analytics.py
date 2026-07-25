"""Lead analytics aggregations (Phase 2)."""
from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Lead, LeadStatus, LeadTier


def summary(db: Session) -> dict[str, Any]:
    total = db.scalar(select(func.count(Lead.id))) or 0
    duplicates = db.scalar(
        select(func.count(Lead.id)).where(Lead.status == LeadStatus.duplicate)
    ) or 0

    active_filter = Lead.status != LeadStatus.duplicate

    by_tier = {t.value: 0 for t in LeadTier}
    for tier, count in db.execute(
        select(Lead.tier, func.count(Lead.id)).where(active_filter).group_by(Lead.tier)
    ):
        key = tier.value if hasattr(tier, "value") else tier
        by_tier[key] = count

    by_status: dict[str, int] = {}
    for st, count in db.execute(
        select(Lead.status, func.count(Lead.id)).group_by(Lead.status)
    ):
        key = st.value if hasattr(st, "value") else st
        by_status[key] = count

    by_source: dict[str, int] = {}
    for src, count in db.execute(
        select(Lead.source, func.count(Lead.id)).where(active_filter).group_by(Lead.source)
    ):
        by_source[src or "(unknown)"] = count

    avg_score = db.scalar(select(func.avg(Lead.score)).where(active_filter))

    # Count how often each offer was recommended as the primary (first) offer.
    offer_counter: Counter[str] = Counter()
    for (offers,) in db.execute(
        select(Lead.recommended_offers).where(active_filter)
    ):
        if offers:
            primary = offers[0]
            offer_counter[primary.get("name", primary.get("key", "?"))] += 1
    top_offers = [
        {"name": name, "count": count}
        for name, count in offer_counter.most_common(10)
    ]

    return {
        "total_leads": total,
        "active_leads": total - duplicates,
        "duplicates": duplicates,
        "avg_score": round(avg_score, 1) if avg_score is not None else 0.0,
        "by_tier": by_tier,
        "by_status": by_status,
        "by_source": by_source,
        "top_offers": top_offers,
    }
