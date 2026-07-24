"""Duplicate detection.

Strategy (cheap → expensive):
  1. Exact match on normalized email  -> definite duplicate.
  2. Exact match on normalized phone   -> definite duplicate.
  3. Fuzzy match on (name + company)   -> duplicate when similarity >= threshold.

Returns the matched existing Lead, or None.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Lead


def normalize_email(email: str | None) -> str | None:
    if not email:
        return None
    return email.strip().lower() or None


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    # Drop a leading US country code so +1 (555) 123-4567 == 5551234567.
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits or None


def _norm_text(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio() * 100


def find_duplicate(
    db: Session, payload: dict, *, threshold: int = 85, exclude_id: int | None = None
) -> Lead | None:
    """Find an existing lead that duplicates ``payload``."""
    email = normalize_email(payload.get("email"))
    phone = normalize_phone(payload.get("phone"))

    base = select(Lead)
    if exclude_id is not None:
        base = base.where(Lead.id != exclude_id)

    # 1. Exact email.
    if email:
        match = db.execute(
            base.where(func.lower(Lead.email) == email)
        ).scalars().first()
        if match:
            return match

    # 2. Exact phone (normalize both sides in Python — portable across engines).
    if phone:
        candidates = db.execute(
            base.where(Lead.phone.is_not(None))
        ).scalars().all()
        for cand in candidates:
            if normalize_phone(cand.phone) == phone:
                return cand

    # 3. Fuzzy name + company.
    name = _norm_text(
        f"{payload.get('first_name', '')} {payload.get('last_name', '')}"
    )
    company = _norm_text(payload.get("company"))
    if name or company:
        candidates = db.execute(base).scalars().all()
        best: tuple[float, Lead | None] = (0.0, None)
        for cand in candidates:
            cand_name = _norm_text(f"{cand.first_name or ''} {cand.last_name or ''}")
            cand_company = _norm_text(cand.company)
            name_sim = _similarity(name, cand_name) if name and cand_name else 0.0
            comp_sim = (
                _similarity(company, cand_company) if company and cand_company else 0.0
            )
            # Require BOTH name and company to align strongly to avoid false
            # positives from common names or common company words.
            if name and company and cand_name and cand_company:
                combined = 0.5 * name_sim + 0.5 * comp_sim
                if name_sim >= 80 and comp_sim >= 80 and combined > best[0]:
                    best = (combined, cand)
        if best[1] is not None and best[0] >= threshold:
            return best[1]

    return None
