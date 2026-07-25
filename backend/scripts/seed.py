"""Seed the database with the sample CSV. Run: `python -m scripts.seed`."""
from __future__ import annotations

from pathlib import Path

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.services import csv_io

SAMPLE = Path(__file__).resolve().parent.parent / "sample_data" / "leads_sample.csv"


def main() -> None:
    init_db()
    settings = get_settings()
    text = SAMPLE.read_text(encoding="utf-8-sig")
    db = SessionLocal()
    try:
        summary = csv_io.import_leads(db, text, dedup_threshold=settings.dedup_threshold)
    finally:
        db.close()
    print("Seed summary:", summary)


if __name__ == "__main__":
    main()
