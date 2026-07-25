from app.services import analytics


def _seed(client, admin_auth):
    for i in range(3):
        client.post(
            "/api/leads",
            json={
                "email": f"a{i}@c.com", "company": f"Co{i}", "job_title": "Owner",
                "annual_revenue": 1_500_000, "employees": 12, "readiness_score": 60,
                "source": "assessment",
            },
            auth=admin_auth,
        )
    # A duplicate of the first.
    client.post(
        "/api/leads",
        json={"email": "a0@c.com", "company": "Co0", "job_title": "Owner"},
        auth=admin_auth,
    )


def test_analytics_requires_auth(client):
    assert client.get("/api/analytics/summary").status_code == 401


def test_analytics_summary_counts(client, admin_auth):
    _seed(client, admin_auth)
    r = client.get("/api/analytics/summary", auth=admin_auth)
    assert r.status_code == 200
    data = r.json()
    assert data["total_leads"] == 4
    assert data["active_leads"] == 3
    assert data["duplicates"] == 1
    assert data["by_source"].get("assessment") == 3
    assert data["avg_score"] > 0
    assert isinstance(data["top_offers"], list)


def test_analytics_service_empty_db(db):
    data = analytics.summary(db)
    assert data["total_leads"] == 0
    assert data["avg_score"] == 0.0
    assert data["top_offers"] == []
