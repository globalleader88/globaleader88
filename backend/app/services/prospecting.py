"""Prospect Finder (Phase 3, demand generation).

Finds GovCon businesses that match an ideal-customer profile (ICP) from *public*
federal data, scores each for fit, and produces a UTM-tracked assessment link
plus a personalized outreach draft. Output is an outreach list — it does NOT
insert leads into the engine; a prospect becomes a lead only when they take the
assessment (which posts through the funnel → webhook).

Sources are pluggable behind ``ProspectSource``:
  - ``sample``      : deterministic built-in data (no network) — default; used by
                      tests and for a zero-config demo.
  - ``usaspending`` : USASpending.gov public API (no key) — real federal awardees.
SAM.gov (registered entities, needs a free key) can be added as another source.

Compliance note: this produces *targets and drafts only*. Sending outreach is the
operator's responsibility and must follow CAN-SPAM / platform terms.
"""
from __future__ import annotations

import csv
import io
import urllib.parse
from dataclasses import dataclass, field
from typing import Any

from ..config import get_settings

settings = get_settings()


@dataclass
class ICP:
    """Ideal-customer profile — the targeting filters."""

    naics_codes: list[str] = field(default_factory=lambda: [
        "541511",  # Custom Computer Programming Services
        "541512",  # Computer Systems Design Services
        "541611",  # Admin & General Management Consulting
        "561210",  # Facilities Support Services
    ])
    state: str | None = None            # e.g. "GA"; None = nationwide
    max_award_amount: float = 500_000   # smaller awards ⇒ smaller firms who need help
    limit: int = 25


@dataclass
class Prospect:
    name: str
    naics: str | None = None
    state: str | None = None
    recent_award_amount: float | None = None
    awarding_agency: str | None = None
    uei: str | None = None
    fit_score: int = 0
    assessment_link: str | None = None
    outreach_draft: str | None = None


# --- Fit scoring --------------------------------------------------------
def score_fit(p: Prospect, icp: ICP) -> int:
    """0-100 fit: reward target NAICS/state and small-award firms (more need)."""
    score = 40  # base: they're an active federal contractor
    if p.naics and p.naics in icp.naics_codes:
        score += 25
    if icp.state and p.state == icp.state:
        score += 15
    amt = p.recent_award_amount
    if amt is not None:
        if amt <= 100_000:
            score += 20   # very small ⇒ strong need for help scaling
        elif amt <= icp.max_award_amount:
            score += 10
    return max(0, min(100, score))


# --- Tracked link + outreach draft -------------------------------------
def tracked_link(base_url: str, *, campaign: str, prospect_ref: str) -> str:
    """Assessment URL with UTM params so the engine attributes the lead."""
    params = {
        "utm_source": "prospecting",
        "utm_campaign": campaign,
        "utm_content": prospect_ref,
    }
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}{urllib.parse.urlencode(params)}"


def outreach_draft(p: Prospect, link: str) -> str:
    agency = f" with {p.awarding_agency}" if p.awarding_agency else " in federal contracting"
    return (
        f"Subject: A quick read on {p.name}'s federal contracting readiness\n\n"
        f"Hi there,\n\n"
        f"I came across {p.name}'s recent activity{agency} and put together a free, "
        f"2-minute Federal Contracting Readiness Assessment that scores where you "
        f"stand on registration, certifications, past performance, pipeline, and "
        f"proposal readiness — with a tailored action plan.\n\n"
        f"Take it here: {link}\n\n"
        f"If the score surprises you (most firms have 1-2 quick wins they're missing), "
        f"I'm happy to walk through it on a free 30-minute call.\n\n"
        f"— The Global Connects Services\n"
        f"(Reply STOP to opt out.)"
    )


# --- Sources ------------------------------------------------------------
_SAMPLE_ROWS: list[dict[str, Any]] = [
    {"name": "Apex Technologies LLC", "naics": "541511", "state": "GA", "recent_award_amount": 82000, "awarding_agency": "Dept. of Veterans Affairs", "uei": "APEX1234ABCD"},
    {"name": "Blue Rivers Logistics", "naics": "561210", "state": "GA", "recent_award_amount": 240000, "awarding_agency": "GSA", "uei": "BLUE5678EFGH"},
    {"name": "Nair Consulting", "naics": "541611", "state": "FL", "recent_award_amount": 45000, "awarding_agency": "SBA", "uei": "NAIR9012IJKL"},
    {"name": "Becker Fabrication", "naics": "332312", "state": "GA", "recent_award_amount": 610000, "awarding_agency": "Dept. of Defense", "uei": "BECK3456MNOP"},
    {"name": "Weiss & Partners", "naics": "541512", "state": "VA", "recent_award_amount": 120000, "awarding_agency": "Dept. of Homeland Security", "uei": "WEIS7890QRST"},
]


def _sample_source(icp: ICP) -> list[dict[str, Any]]:
    return _SAMPLE_ROWS


def _usaspending_source(icp: ICP) -> list[dict[str, Any]]:
    """Query USASpending.gov for recent small federal awardees (no API key)."""
    import httpx

    filters: dict[str, Any] = {
        "award_type_codes": ["A", "B", "C", "D"],
        "time_period": [{"start_date": "2023-01-01", "end_date": "2025-12-31"}],
    }
    if icp.naics_codes:
        filters["naics_codes"] = icp.naics_codes
    if icp.state:
        filters["recipient_locations"] = [{"country": "USA", "state": icp.state}]

    body = {
        "filters": filters,
        "fields": [
            "Award ID", "Recipient Name", "Award Amount", "Awarding Agency",
            "NAICS Code", "Place of Performance State Code", "recipient_id",
        ],
        "page": 1,
        "limit": min(icp.limit, 100),
        "sort": "Award Amount",
        "order": "asc",  # smallest awards first ⇒ smaller firms
    }
    resp = httpx.post(
        "https://api.usaspending.gov/api/v2/search/spending_by_award/",
        json=body,
        timeout=settings.prospecting_timeout_seconds,
    )
    resp.raise_for_status()
    out: list[dict[str, Any]] = []
    for r in resp.json().get("results", []):
        out.append({
            "name": r.get("Recipient Name"),
            "naics": r.get("NAICS Code"),
            "state": r.get("Place of Performance State Code"),
            "recent_award_amount": r.get("Award Amount"),
            "awarding_agency": r.get("Awarding Agency"),
            "uei": r.get("recipient_id"),
        })
    return out


_SOURCES = {"sample": _sample_source, "usaspending": _usaspending_source}


def find_prospects(icp: ICP | None = None, *, campaign: str = "govcon") -> list[Prospect]:
    """Find, score, and enrich prospects with links + drafts, ranked by fit."""
    icp = icp or ICP()
    source = _SOURCES.get(settings.prospecting_source, _sample_source)
    rows = source(icp)

    base = settings.assessment_base_url
    prospects: list[Prospect] = []
    for i, row in enumerate(rows):
        if not row.get("name"):
            continue
        amt = row.get("recent_award_amount")
        # Respect the max-award ceiling for real sources (sample is small already).
        if amt is not None and amt > icp.max_award_amount:
            continue
        p = Prospect(
            name=row["name"], naics=row.get("naics"), state=row.get("state"),
            recent_award_amount=amt, awarding_agency=row.get("awarding_agency"),
            uei=row.get("uei"),
        )
        p.fit_score = score_fit(p, icp)
        ref = (p.uei or f"p{i}")
        p.assessment_link = tracked_link(base, campaign=campaign, prospect_ref=ref)
        p.outreach_draft = outreach_draft(p, p.assessment_link)
        prospects.append(p)

    prospects.sort(key=lambda x: x.fit_score, reverse=True)
    return prospects[: icp.limit]


def to_csv(prospects: list[Prospect]) -> str:
    buf = io.StringIO()
    cols = ["name", "fit_score", "naics", "state", "recent_award_amount",
            "awarding_agency", "uei", "assessment_link"]
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for p in prospects:
        w.writerow({c: getattr(p, c) for c in cols})
    return buf.getvalue()
