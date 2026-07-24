"""Offer recommendation engine.

Maps a lead's readiness and fit to the most relevant GovCon advisory offers.
Recommendations are ordered by relevance; the first entry is the primary pitch.
"""
from __future__ import annotations

from typing import Any

# Catalog of Global Connects advisory offers. Each has a stage it fits and a
# short pitch the sales team can use verbatim.
OFFERS = {
    "registration_onboarding": {
        "name": "SAM.gov Registration & GovCon Onboarding",
        "stage": "starter",
        "price_hint": "$1,500 one-time",
        "pitch": "Get registered, compliant, and eligible to bid — SAM.gov, "
        "UEI, NAICS selection, and reps & certs done for you.",
    },
    "certification_advisory": {
        "name": "Set-Aside Certification Advisory (8(a) / WOSB / HUBZone / SDVOSB)",
        "stage": "growth",
        "price_hint": "$3,500 project",
        "pitch": "Unlock sole-source and set-aside contracts by securing the "
        "certifications your firm qualifies for.",
    },
    "capability_statement": {
        "name": "Capability Statement & Past-Performance Package",
        "stage": "growth",
        "price_hint": "$1,200 project",
        "pitch": "A contracting-officer-ready capability statement plus a "
        "structured past-performance library that wins shortlists.",
    },
    "proposal_retainer": {
        "name": "Proposal Development & Bid Support Retainer",
        "stage": "scale",
        "price_hint": "$5,000/mo retainer",
        "pitch": "Hands-on proposal writing, compliance matrices, and pricing "
        "strategy to turn a strong pipeline into awards.",
    },
    "strategy_call": {
        "name": "Free 30-Minute GovCon Strategy Call",
        "stage": "any",
        "price_hint": "Free",
        "pitch": "A no-obligation call to map the fastest path to your first "
        "(or next) federal award.",
    },
}


def recommend_offers(lead: dict[str, Any], score: int) -> list[dict[str, Any]]:
    """Return a ranked list of offer dicts for this lead."""
    rs = lead.get("readiness_score")
    picks: list[str] = []

    if rs is None:
        # No assessment: lead with discovery, then the entry offer.
        picks = ["strategy_call", "registration_onboarding", "capability_statement"]
    elif rs < 40:
        # Early stage — needs to become eligible first.
        picks = ["registration_onboarding", "capability_statement", "strategy_call"]
    elif rs < 70:
        # Eligible but not competitive — certifications + positioning.
        picks = ["certification_advisory", "capability_statement", "strategy_call"]
    else:
        # Ready to compete — help them win.
        picks = ["proposal_retainer", "certification_advisory", "strategy_call"]

    # Hot leads always get a direct call CTA surfaced first.
    if score >= 70 and "strategy_call" in picks:
        picks.remove("strategy_call")
        picks.insert(0, "strategy_call")

    # De-dupe while preserving order, then materialize.
    seen: set[str] = set()
    ordered = [p for p in picks if not (p in seen or seen.add(p))]
    return [{"key": key, **OFFERS[key]} for key in ordered]
