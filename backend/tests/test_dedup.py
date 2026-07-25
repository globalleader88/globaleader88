from app.services import dedup
from app.services.intake import process_lead


def test_normalize_phone_strips_formatting_and_country_code():
    assert dedup.normalize_phone("+1 (202) 555-0142") == "2025550142"
    assert dedup.normalize_phone("202.555.0142") == "2025550142"
    assert dedup.normalize_phone("") is None


def test_exact_email_duplicate(db):
    process_lead(db, {"email": "dup@co.com", "company": "A", "first_name": "Sam"})
    match = dedup.find_duplicate(db, {"email": "DUP@co.com"})
    assert match is not None


def test_exact_phone_duplicate_ignoring_format(db):
    process_lead(db, {"phone": "(202) 555-0142", "company": "A", "first_name": "Sam"})
    match = dedup.find_duplicate(db, {"phone": "2025550142"})
    assert match is not None


def test_fuzzy_name_company_duplicate(db):
    process_lead(db, {"first_name": "Maria", "last_name": "Gomez", "company": "Apex Technologies LLC"})
    match = dedup.find_duplicate(
        db, {"first_name": "Maria", "last_name": "Gomez", "company": "Apex Technologies"}
    )
    assert match is not None


def test_different_people_not_duplicate(db):
    process_lead(db, {"first_name": "Maria", "last_name": "Gomez", "company": "Apex"})
    match = dedup.find_duplicate(
        db, {"first_name": "John", "last_name": "Smith", "company": "Zenith Corp"}
    )
    assert match is None


def test_process_lead_flags_duplicate_and_preserves_original(db):
    original, is_dupe1 = process_lead(db, {"email": "x@co.com", "company": "A", "first_name": "Sam"})
    assert is_dupe1 is False
    dupe, is_dupe2 = process_lead(db, {"email": "x@co.com", "company": "A", "first_name": "Sam"})
    assert is_dupe2 is True
    assert dupe.duplicate_of_id == original.id
    assert dupe.status.value == "duplicate"
    assert dupe.id != original.id
