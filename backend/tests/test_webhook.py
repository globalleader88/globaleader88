def test_webhook_requires_secret(client):
    r = client.post("/webhook/lead", json={"email": "a@b.com"})
    assert r.status_code == 401


def test_webhook_accepts_lead_with_secret(client, webhook_headers):
    payload = {
        "name": "Grace Hopper",
        "email": "grace@navy.mil",
        "phone": "555-0143",
        "organization": "Navy Yard LLC",
        "title": "Owner",
        "utm_source": "assessment",
        "readinessScore": 66,
        "categories": {"eligibility": 80, "certs": 40},
    }
    r = client.post("/webhook/lead", json=payload, headers=webhook_headers)
    assert r.status_code == 200
    body = r.json()
    # name split into first/last
    assert body["lead"]["first_name"] == "Grace"
    assert body["lead"]["last_name"] == "Hopper"
    # aliases mapped
    assert body["lead"]["company"] == "Navy Yard LLC"
    assert body["lead"]["source"] == "assessment"
    assert body["lead"]["readiness_score"] == 66
    # assessment breakdown preserved
    assert body["lead"]["assessment"]["categories"]["eligibility"] == 80
    assert body["score"] > 0


def test_webhook_secret_via_query_param(client):
    r = client.post(
        "/webhook/lead?secret=test-secret",
        json={"email": "q@c.com", "company": "Q"},
    )
    assert r.status_code == 200


def test_webhook_dedupes_repeat_submission(client, webhook_headers):
    p = {"email": "repeat@c.com", "company": "Repeat Co", "name": "Sam Jones"}
    r1 = client.post("/webhook/lead", json=p, headers=webhook_headers)
    r2 = client.post("/webhook/lead", json=p, headers=webhook_headers)
    assert r1.json()["is_duplicate"] is False
    assert r2.json()["is_duplicate"] is True


def test_accepts_exact_funnel_payload(client, webhook_headers):
    """Contract test: the payload shape the funnel (js/leadgen.js) actually POSTs.

    If the funnel's field names change, this test breaks — catching a silent
    contract drift between the two halves of the product.
    """
    funnel_payload = {
        "name": "Maria Gomez",
        "email": "maria@apextech.com",
        "company": "Apex Technologies LLC",
        "phone": "(202) 555-0142",
        "goal": "Win my first federal contract within 12 months",
        "score": 58,
        "tier": "Developing",
        "categories": [
            {"label": "Registration & Eligibility", "score": 80},
            {"label": "Certifications & Set-Asides", "score": 40},
        ],
        "recommendations": ["Register in SAM.gov", "Pursue WOSB certification"],
        "answers": {"q1": "yes", "q2": "no"},
        "submittedAt": "2026-07-25T12:00:00.000Z",
        "source": "Readiness Assessment",
    }
    r = client.post("/webhook/lead", json=funnel_payload, headers=webhook_headers)
    assert r.status_code == 200
    lead = r.json()["lead"]
    # Core contact fields land in the right columns.
    assert lead["first_name"] == "Maria"
    assert lead["last_name"] == "Gomez"
    assert lead["email"] == "maria@apextech.com"
    assert lead["company"] == "Apex Technologies LLC"
    # Assessment score/tier map to the readiness columns.
    assert lead["readiness_score"] == 58
    assert lead["readiness_tier"] == "Developing"
    # Free-text goal becomes notes; the funnel's own recos/categories are kept.
    assert lead["notes"] == "Win my first federal contract within 12 months"
    assert lead["source"] == "Readiness Assessment"
    assert lead["assessment"]["categories"][0]["label"] == "Registration & Eligibility"
    # And it was scored.
    assert r.json()["score"] > 0
    assert r.json()["tier"] in ("hot", "warm", "cold")
