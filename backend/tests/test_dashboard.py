def test_dashboard_requires_auth(client):
    assert client.get("/").status_code == 401


def test_dashboard_renders(client, admin_auth):
    client.post("/api/leads", json={"email": "d@c.com", "company": "Dash Co", "first_name": "D"}, auth=admin_auth)
    r = client.get("/", auth=admin_auth)
    assert r.status_code == 200
    assert "Lead Dashboard" in r.text
    assert "Dash Co" in r.text


def test_lead_detail_page(client, admin_auth):
    lid = client.post(
        "/api/leads",
        json={"email": "detail@c.com", "company": "Detail Co", "job_title": "CEO", "readiness_score": 55},
        auth=admin_auth,
    ).json()["lead"]["id"]
    r = client.get(f"/leads/{lid}", auth=admin_auth)
    assert r.status_code == 200
    assert "Detail Co" in r.text
    assert "Recommended offers" in r.text


def test_lead_detail_404(client, admin_auth):
    assert client.get("/leads/999999", auth=admin_auth).status_code == 404
