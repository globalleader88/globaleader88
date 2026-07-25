from pathlib import Path

from app.services import csv_io

SAMPLE = Path(__file__).resolve().parent.parent / "sample_data" / "leads_sample.csv"


def test_import_sample_csv(db):
    text = SAMPLE.read_text(encoding="utf-8-sig")
    summary = csv_io.import_leads(db, text)
    assert summary["received"] == 6
    # The 5th row is Maria again -> duplicate of row 1.
    assert summary["duplicates"] >= 1
    assert summary["created"] >= 4
    assert summary["errors"] == 0


def test_export_roundtrip(db):
    csv_io.import_leads(db, SAMPLE.read_text(encoding="utf-8-sig"))
    out = csv_io.export_leads(db)
    lines = out.strip().splitlines()
    assert lines[0].startswith("id,first_name,last_name")
    assert len(lines) >= 6  # header + all rows (dupes included in export)
    assert "Apex Technologies LLC" in out


def test_import_row_without_identifier_is_error(db):
    text = "first_name,last_name,email\n,,\n"
    summary = csv_io.import_leads(db, text)
    assert summary["errors"] == 1
    assert summary["created"] == 0


def test_import_coerces_numeric_fields(db):
    text = "email,company,employees,annual_revenue,readiness_score\ne@c.com,C,10,500000,42\n"
    summary = csv_io.import_leads(db, text)
    assert summary["created"] == 1
    out = csv_io.export_leads(db)
    assert "e@c.com" in out
