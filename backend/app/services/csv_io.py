"""CSV import and export for leads."""
from __future__ import annotations

import csv
import io
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Lead
from . import intake

# Columns accepted on import and emitted on export (profile fields).
IMPORT_FIELDS = [
    "first_name", "last_name", "email", "phone", "company", "job_title",
    "website", "industry", "employees", "annual_revenue", "source",
    "campaign", "notes", "readiness_score", "readiness_tier",
]

EXPORT_FIELDS = [
    "id", *IMPORT_FIELDS, "score", "tier", "status", "duplicate_of_id",
    "created_at",
]

_INT_FIELDS = {"employees"}
_FLOAT_FIELDS = {"annual_revenue", "readiness_score"}


def _coerce_row(row: dict[str, str]) -> dict[str, Any]:
    """Trim, blank->None, and coerce numeric columns from a CSV row."""
    out: dict[str, Any] = {}
    for key in IMPORT_FIELDS:
        raw = row.get(key)
        if raw is None:
            continue
        val: Any = raw.strip()
        if val == "":
            val = None
        elif key in _INT_FIELDS:
            val = int(float(val))
        elif key in _FLOAT_FIELDS:
            val = float(val)
        out[key] = val
    return out


def import_leads(
    db: Session, file_text: str, *, dedup_threshold: int = 85
) -> dict[str, Any]:
    """Import leads from CSV text. Each row runs through the full intake path."""
    reader = csv.DictReader(io.StringIO(file_text))
    received = created = duplicates = errors = 0
    error_details: list[str] = []

    for i, row in enumerate(reader, start=2):  # row 1 is the header
        received += 1
        try:
            payload = _coerce_row(row)
            if not any(payload.get(f) for f in ("email", "phone", "company", "last_name")):
                raise ValueError("row has no email/phone/company/name to identify a lead")
            _lead, is_dupe = intake.process_lead(
                db, payload, dedup_threshold=dedup_threshold
            )
            if is_dupe:
                duplicates += 1
            else:
                created += 1
        except Exception as exc:  # noqa: BLE001 - report per-row, keep going
            errors += 1
            error_details.append(f"row {i}: {exc}")

    return {
        "received": received,
        "created": created,
        "duplicates": duplicates,
        "errors": errors,
        "error_details": error_details,
    }


def export_leads(db: Session) -> str:
    """Return all leads as CSV text."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=EXPORT_FIELDS, extrasaction="ignore")
    writer.writeheader()
    leads = db.execute(select(Lead).order_by(Lead.id)).scalars().all()
    for lead in leads:
        row = {f: getattr(lead, f, None) for f in EXPORT_FIELDS}
        row["tier"] = lead.tier.value if lead.tier else None
        row["status"] = lead.status.value if lead.status else None
        row["created_at"] = lead.created_at.isoformat() if lead.created_at else None
        writer.writerow(row)
    return buf.getvalue()
