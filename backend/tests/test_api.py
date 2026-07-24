def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_create_lead_requires_auth(client):
    r = client.post("/api/leads", json={"email": "a@b.com"})
    assert r.status_code == 401


def test_create_lead_returns_score_and_offers(client, admin_auth):
    payload = {
        "first_name": "Dana", "last_name": "Reed", "email": "dana@reedco.com",
        "phone": "555-0100", "company": "Reed Co", "job_title": "Owner",
        "annual_revenue": 1_500_000, "employees": 15, "readiness_score": 62,
        "source": "api",
    }
    r = client.post("/api/leads", json=payload, auth=admin_auth)
    assert r.status_code == 201
    body = r.json()
    assert body["is_duplicate"] is False
    assert body["score"] > 0
    assert body["tier"] in ("hot", "warm", "cold")
    assert len(body["recommended_offers"]) >= 1


def test_list_and_get_lead(client, admin_auth):
    client.post("/api/leads", json={"email": "l@c.com", "company": "C", "first_name": "L"}, auth=admin_auth)
    r = client.get("/api/leads", auth=admin_auth)
    assert r.status_code == 200
    leads = r.json()
    assert len(leads) == 1
    lead_id = leads[0]["id"]
    r2 = client.get(f"/api/leads/{lead_id}", auth=admin_auth)
    assert r2.status_code == 200
    assert r2.json()["email"] == "l@c.com"


def test_duplicate_excluded_from_default_list(client, admin_auth):
    p = {"email": "dupe@c.com", "company": "C", "first_name": "D"}
    client.post("/api/leads", json=p, auth=admin_auth)
    client.post("/api/leads", json=p, auth=admin_auth)
    active = client.get("/api/leads", auth=admin_auth).json()
    assert len(active) == 1
    all_leads = client.get("/api/leads?include_duplicates=true", auth=admin_auth).json()
    assert len(all_leads) == 2


def test_update_lead_status(client, admin_auth):
    lid = client.post("/api/leads", json={"email": "u@c.com", "company": "C"}, auth=admin_auth).json()["lead"]["id"]
    r = client.patch(f"/api/leads/{lid}", json={"status": "qualified", "notes": "called"}, auth=admin_auth)
    assert r.status_code == 200
    assert r.json()["status"] == "qualified"
    assert r.json()["notes"] == "called"


def test_export_csv_endpoint(client, admin_auth):
    client.post("/api/leads", json={"email": "e@c.com", "company": "Export Co"}, auth=admin_auth)
    r = client.get("/api/leads/export.csv", auth=admin_auth)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "Export Co" in r.text


def test_import_csv_endpoint(client, admin_auth):
    csv_text = "first_name,email,company\nJane,jane@imp.com,Import Co\n"
    files = {"file": ("leads.csv", csv_text, "text/csv")}
    r = client.post("/api/leads/import", files=files, auth=admin_auth)
    assert r.status_code == 200
    assert r.json()["created"] == 1
