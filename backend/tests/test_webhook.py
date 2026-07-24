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
