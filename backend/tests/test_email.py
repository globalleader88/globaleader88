"""SMTP email provider tests, using a fake smtplib.SMTP (no real mail server)."""
import smtplib

import pytest

from app.services import email as email_mod
from app.services import integrations
from app.services.intake import process_lead


class FakeSMTP:
    """Records interactions; stands in for smtplib.SMTP as a context manager."""

    sent: list = []

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port
        self.started_tls = False
        self.logged_in = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.started_tls = True

    def login(self, user, password):
        self.logged_in = (user, password)

    def send_message(self, msg):
        FakeSMTP.sent.append(
            {"To": msg["To"], "From": msg["From"], "Subject": msg["Subject"],
             "body": msg.get_content()}
        )


@pytest.fixture(autouse=True)
def _reset_fake():
    FakeSMTP.sent = []
    yield
    FakeSMTP.sent = []


@pytest.fixture
def smtp_configured(monkeypatch):
    """Turn on the SMTP provider and swap in the fake transport."""
    s = email_mod.settings
    monkeypatch.setattr(s, "smtp_host", "smtp.test")
    monkeypatch.setattr(s, "smtp_user", "user")
    monkeypatch.setattr(s, "smtp_password", "pw")
    monkeypatch.setattr(integrations.settings, "email_provider", "smtp")
    monkeypatch.setattr(integrations.settings, "hot_lead_alert_to", "sales@gc.com,ceo@gc.com")
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    return monkeypatch


def _hot_lead_payload():
    return {
        "email": "hot@co.com", "phone": "555-1", "company": "HotCo",
        "job_title": "Owner", "annual_revenue": 2_000_000, "employees": 20,
        "readiness_score": 60,
    }


def test_hot_lead_sends_alert_email(db, smtp_configured):
    lead, _ = process_lead(db, _hot_lead_payload())
    assert lead.score >= 70
    assert len(FakeSMTP.sent) == 1
    msg = FakeSMTP.sent[0]
    assert msg["To"] == "sales@gc.com, ceo@gc.com"
    assert "Hot GovCon lead" in msg["Subject"]
    assert "HotCo" in msg["body"]


def test_cold_lead_sends_no_alert(db, smtp_configured):
    lead, _ = process_lead(db, {"email": "cold@co.com"})
    assert lead.score < 70
    assert FakeSMTP.sent == []


def test_welcome_email_gated_off_by_default(db, smtp_configured):
    # send_welcome_email defaults to False -> only the alert (if hot) is sent.
    process_lead(db, {"email": "warm@co.com", "company": "WarmCo"})
    assert all("Thanks for" not in m["Subject"] for m in FakeSMTP.sent)


def test_welcome_email_sent_when_enabled(db, smtp_configured, monkeypatch):
    monkeypatch.setattr(integrations.settings, "send_welcome_email", True)
    process_lead(db, {"email": "prospect@co.com", "company": "ProspectCo"})
    welcomes = [m for m in FakeSMTP.sent if "Thanks for" in m["Subject"]]
    assert len(welcomes) == 1
    assert welcomes[0]["To"] == "prospect@co.com"


def test_smtp_failure_does_not_break_intake(db, smtp_configured, monkeypatch):
    def boom(*a, **k):
        raise smtplib.SMTPException("server down")

    monkeypatch.setattr(email_mod, "send_email", boom)
    from app.models import Lead, LeadEvent

    lead, _ = process_lead(db, _hot_lead_payload())
    assert db.get(Lead, lead.id) is not None
    kinds = [e.kind for e in db.query(LeadEvent).filter(LeadEvent.lead_id == lead.id)]
    assert "integration_error" in kinds


def test_default_provider_sends_no_email(db, monkeypatch):
    # EMAIL_PROVIDER defaults to "none"; even a hot lead sends nothing.
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    process_lead(db, _hot_lead_payload())
    assert FakeSMTP.sent == []


def test_send_email_requires_configuration(monkeypatch):
    monkeypatch.setattr(email_mod.settings, "smtp_host", None)
    with pytest.raises(RuntimeError):
        email_mod.send_email("s", "b", ["x@y.com"])


def test_send_email_uses_transport(monkeypatch):
    monkeypatch.setattr(email_mod.settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    email_mod.send_email("Subject", "Body", ["a@b.com"])
    assert len(FakeSMTP.sent) == 1
    assert FakeSMTP.sent[0]["Subject"] == "Subject"
