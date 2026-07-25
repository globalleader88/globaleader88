import httpx
import pytest

from app.models import Lead, LeadEvent
from app.services import integrations
from app.services.intake import process_lead


def _event_kinds(db, lead_id):
    events = db.query(LeadEvent).filter(LeadEvent.lead_id == lead_id).all()
    return [e.kind for e in events]


def _event_messages(db, lead_id):
    events = db.query(LeadEvent).filter(LeadEvent.lead_id == lead_id).all()
    return [e.message or "" for e in events]


class _FakeResponse:
    def __init__(self, status_code=200):
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("err", request=None, response=None)


@pytest.fixture
def use_webhook_crm(monkeypatch):
    monkeypatch.setattr(integrations.settings, "crm_provider", "webhook")
    monkeypatch.setattr(
        integrations.settings, "crm_webhook_url", "https://crm.test/inbound"
    )
    return monkeypatch


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


# --- Outbound webhook CRM provider (feature-flagged) --------------------
def test_webhook_crm_posts_lead(db, use_webhook_crm):
    calls = []

    def fake_post(url, json=None, timeout=None):
        calls.append({"url": url, "json": json})
        return _FakeResponse(200)

    use_webhook_crm.setattr(httpx, "post", fake_post)

    lead, _ = process_lead(db, {"email": "crm@co.com", "company": "CRM Co"})
    assert len(calls) == 1
    assert calls[0]["url"] == "https://crm.test/inbound"
    assert calls[0]["json"]["email"] == "crm@co.com"
    assert calls[0]["json"]["id"] == lead.id
    assert any("CRM webhook posted" in m for m in _event_messages(db, lead.id))


def test_webhook_crm_without_url_skips(db, monkeypatch):
    monkeypatch.setattr(integrations.settings, "crm_provider", "webhook")
    monkeypatch.setattr(integrations.settings, "crm_webhook_url", None)
    called = []
    monkeypatch.setattr(httpx, "post", lambda *a, **k: called.append(1))

    lead, _ = process_lead(db, {"email": "nourl@co.com", "company": "NoUrl"})
    assert called == []
    assert any("no CRM_WEBHOOK_URL" in m for m in _event_messages(db, lead.id))


def test_webhook_crm_failure_does_not_break_intake(db, use_webhook_crm):
    def boom(*a, **k):
        raise httpx.ConnectError("down")

    use_webhook_crm.setattr(httpx, "post", boom)

    # Intake must still succeed and persist the lead.
    lead, _ = process_lead(db, {"email": "fail@co.com", "company": "FailCo"})
    assert db.get(Lead, lead.id) is not None
    assert "integration_error" in _event_kinds(db, lead.id)


def test_default_provider_makes_no_http_call(db, monkeypatch):
    called = []
    monkeypatch.setattr(httpx, "post", lambda *a, **k: called.append(1))
    process_lead(db, {"email": "default@co.com", "company": "D"})
    assert called == []  # CRM_PROVIDER defaults to "none"


def test_dispatch_runs_on_background_thread_queue(db):
    """With the thread queue, dispatch happens off the caller and still lands."""
    from app.services import jobs
    from app.services.jobs import ThreadJobQueue

    original = jobs.get_job_queue()
    tq = ThreadJobQueue(max_workers=2)
    jobs.set_job_queue(tq)
    try:
        lead, _ = process_lead(
            db,
            {
                "email": "thread@co.com", "phone": "555-9", "company": "ThreadCo",
                "job_title": "Owner", "annual_revenue": 2_000_000, "employees": 20,
                "readiness_score": 60,
            },
        )
        tq.shutdown()  # join the background job
    finally:
        jobs.set_job_queue(original)

    # The job wrote its events via its own session; confirm they landed.
    assert "notify" in _event_kinds(db, lead.id)
