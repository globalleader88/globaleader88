"""Lead scoring.

Produces a 0-100 score and a hot/warm/cold tier from a lead's profile. The
model is intentionally transparent (additive, capped) so a salesperson can
read the breakdown and trust it. It blends two signals:

  1. Fit / completeness  — do we have enough to act, and is this the kind of
     org that buys GovCon advisory (senior title, has a company, revenue).
  2. Readiness intent     — the score the prospect earned in the Federal
     Contracting Readiness Assessment, if they took it.
"""
from __future__ import annotations

from typing import Any

# Titles that indicate a decision-maker for a consulting engagement.
_SENIOR_TITLE_KEYWORDS = (
    "owner", "founder", "co-founder", "president", "ceo", "cfo", "coo",
    "principal", "partner", "director", "vp", "vice president", "head",
    "managing", "chief",
)

MAX_SCORE = 100


def _title_points(job_title: str | None) -> int:
    if not job_title:
        return 0
    t = job_title.lower()
    return 20 if any(k in t for k in _SENIOR_TITLE_KEYWORDS) else 8


def _contact_points(lead: dict[str, Any]) -> int:
    pts = 0
    if lead.get("email"):
        pts += 12
    if lead.get("phone"):
        pts += 10
    if lead.get("company"):
        pts += 8
    return pts


def _firmographic_points(lead: dict[str, Any]) -> int:
    pts = 0
    revenue = lead.get("annual_revenue")
    if revenue:
        # Consulting fits established small/mid businesses best.
        if revenue >= 1_000_000:
            pts += 12
        elif revenue >= 250_000:
            pts += 8
        else:
            pts += 4
    employees = lead.get("employees")
    if employees:
        if employees >= 10:
            pts += 8
        elif employees >= 2:
            pts += 5
        else:
            pts += 2
    return pts


def _readiness_points(lead: dict[str, Any]) -> int:
    """Reward *engagement* with the assessment and mid-range readiness.

    Very low readiness = lots of work but real need; very high = may not need
    us. Mid-range prospects who engaged convert best, so they score highest.
    """
    rs = lead.get("readiness_score")
    if rs is None:
        return 0
    took_it = 8  # they completed the funnel at all
    if 40 <= rs <= 80:
        return took_it + 22
    if 20 <= rs < 40 or 80 < rs <= 90:
        return took_it + 14
    return took_it + 6


def score_lead(lead: dict[str, Any]) -> dict[str, Any]:
    """Return {'score': int, 'tier': str, 'breakdown': {...}}."""
    breakdown = {
        "contact_completeness": _contact_points(lead),
        "seniority": _title_points(lead.get("job_title")),
        "firmographics": _firmographic_points(lead),
        "readiness_intent": _readiness_points(lead),
    }
    raw = sum(breakdown.values())
    score = max(0, min(MAX_SCORE, raw))

    if score >= 70:
        tier = "hot"
    elif score >= 40:
        tier = "warm"
    else:
        tier = "cold"

    breakdown["total"] = score
    return {"score": score, "tier": tier, "breakdown": breakdown}
