from app.models import Lead, LeadEvent
from app.services.intake import process_lead


def _event_kinds(db, lead_id):
    events = db.query(LeadEvent).filter(LeadEvent.lead_id == lead_id).all()
    return [e.kind for e in events]


def test_hot_lead_triggers_notification_event(db):
    lead, _ = process_lead(
        db,
        {
            "email": "hot@co.com", "phone": "555-1", "company": "HotCo",
            "job_title": "Owner", "annual_revenue": 2_000_000, "employees": 20,
            "readiness_score": 60,
        },
    )
    assert lead.score >= 70
    assert "notify" in _event_kinds(db, lead.id)


def test_cold_lead_has_no_notification(db):
    lead, _ = process_lead(db, {"email": "cold@co.com"})
    assert lead.score < 70
    assert "notify" not in _event_kinds(db, lead.id)


def test_non_duplicate_runs_crm_and_email_dispatch(db):
    lead, _ = process_lead(db, {"email": "disp@co.com", "company": "Disp"})
    kinds = _event_kinds(db, lead.id)
    assert "crm_sync" in kinds
    assert "email" in kinds


def test_duplicate_does_not_dispatch_side_effects(db):
    process_lead(db, {"email": "dup@co.com", "company": "Dup"})
    dupe, is_dupe = process_lead(db, {"email": "dup@co.com", "company": "Dup"})
    assert is_dupe is True
    kinds = _event_kinds(db, dupe.id)
    assert "crm_sync" not in kinds
    assert "notify" not in kinds


def test_intake_path_still_persists_lead(db):
    lead, _ = process_lead(db, {"email": "persist@co.com", "company": "P"})
    assert db.get(Lead, lead.id) is not None
