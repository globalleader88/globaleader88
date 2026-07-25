"""HTTP enrichment provider tests (mocked httpx, no real service)."""
import httpx
import pytest

from app.models import Lead, LeadEvent
from app.services import integrations
from app.services.intake import process_lead


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("err", request=None, response=None)

    def json(self):
        return self._payload


@pytest.fixture
def use_webhook_enrichment(monkeypatch):
    monkeypatch.setattr(integrations.settings, "enrichment_provider", "webhook")
    monkeypatch.setattr(
        integrations.settings, "enrichment_webhook_url", "https://enrich.test/lookup"
    )
    return monkeypatch


def _messages(db, lead_id):
    return [e.message or "" for e in db.query(LeadEvent).filter(LeadEvent.lead_id == lead_id)]


def _kinds(db, lead_id):
    return [e.kind for e in db.query(LeadEvent).filter(LeadEvent.lead_id == lead_id)]


def test_enrichment_fills_empty_fields(db, use_webhook_enrichment):
    def fake_post(url, json=None, timeout=None):
        return _FakeResponse({"industry": "IT Services", "employees": 25, "website": "acme.com"})

    use_webhook_enrichment.setattr(httpx, "post", fake_post)

    lead, _ = process_lead(db, {"email": "e@acme.com", "company": "Acme"})
    db.refresh(lead)
    assert lead.industry == "IT Services"
    assert lead.employees == 25
    assert lead.website == "acme.com"
    assert any("Enriched fields" in m for m in _messages(db, lead.id))


def test_enrichment_never_overwrites_existing(db, use_webhook_enrichment):
    def fake_post(url, json=None, timeout=None):
        return _FakeResponse({"industry": "Overwritten", "employees": 999})

    use_webhook_enrichment.setattr(httpx, "post", fake_post)

    # Lead already has an industry -> enrichment must not clobber it.
    lead, _ = process_lead(
        db, {"email": "e2@acme.com", "company": "Acme", "industry": "Logistics"}
    )
    db.refresh(lead)
    assert lead.industry == "Logistics"  # preserved
    assert lead.employees == 999  # was empty -> filled


def test_enrichment_without_url_skips(db, monkeypatch):
    monkeypatch.setattr(integrations.settings, "enrichment_provider", "webhook")
    monkeypatch.setattr(integrations.settings, "enrichment_webhook_url", None)
    called = []
    monkeypatch.setattr(httpx, "post", lambda *a, **k: called.append(1))

    lead, _ = process_lead(db, {"email": "nourl@acme.com", "company": "Acme"})
    assert called == []
    assert any("no ENRICHMENT_WEBHOOK_URL" in m for m in _messages(db, lead.id))


def test_enrichment_failure_does_not_break_intake(db, use_webhook_enrichment):
    def boom(*a, **k):
        raise httpx.ConnectError("down")

    use_webhook_enrichment.setattr(httpx, "post", boom)

    lead, _ = process_lead(db, {"email": "fail@acme.com", "company": "Acme"})
    assert db.get(Lead, lead.id) is not None
    assert "integration_error" in _kinds(db, lead.id)


def test_non_dict_response_ignored(db, use_webhook_enrichment):
    use_webhook_enrichment.setattr(
        httpx, "post", lambda *a, **k: _FakeResponse(["not", "a", "dict"])
    )
    lead, _ = process_lead(db, {"email": "list@acme.com", "company": "Acme"})
    assert any("not a JSON object" in m for m in _messages(db, lead.id))


def test_default_provider_makes_no_call(db, monkeypatch):
    called = []
    monkeypatch.setattr(httpx, "post", lambda *a, **k: called.append(1))
    process_lead(db, {"email": "d@acme.com", "company": "Acme"})
    assert called == []  # ENRICHMENT_PROVIDER defaults to "none"
