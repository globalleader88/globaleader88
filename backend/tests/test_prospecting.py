"""Prospect Finder tests. Sample source needs no network; USASpending is mocked."""
import httpx
import pytest

from app.services import prospecting
from app.services.prospecting import ICP, Prospect, find_prospects, score_fit, tracked_link


# --- scoring ------------------------------------------------------------
def test_fit_rewards_target_naics_state_and_small_awards():
    icp = ICP(naics_codes=["541511"], state="GA", max_award_amount=500_000)
    strong = Prospect(name="A", naics="541511", state="GA", recent_award_amount=80_000)
    weak = Prospect(name="B", naics="999999", state="CA", recent_award_amount=490_000)
    assert score_fit(strong, icp) > score_fit(weak, icp)
    assert 0 <= score_fit(strong, icp) <= 100


# --- tracked links ------------------------------------------------------
def test_tracked_link_adds_utm_params():
    link = tracked_link("https://funnel.example.com/", campaign="govcon", prospect_ref="UEI123")
    assert "utm_source=prospecting" in link
    assert "utm_campaign=govcon" in link
    assert "utm_content=UEI123" in link


def test_tracked_link_respects_existing_query():
    link = tracked_link("https://x.com/?a=1", campaign="c", prospect_ref="r")
    assert link.count("?") == 1 and "a=1" in link


# --- sample source (default) -------------------------------------------
def test_find_prospects_sample_ranked_with_links_and_drafts():
    results = find_prospects(ICP(state="GA"), campaign="q3")
    assert len(results) >= 1
    # Sorted by fit descending.
    scores = [p.fit_score for p in results]
    assert scores == sorted(scores, reverse=True)
    top = results[0]
    assert top.assessment_link and "utm_campaign=q3" in top.assessment_link
    assert top.outreach_draft and top.name in top.outreach_draft
    # GA + target NAICS firms should outrank an out-of-state non-target one.
    assert top.state == "GA"


def test_max_award_ceiling_filters_out_large_firms():
    # Becker Fabrication has a 610k award; a 200k ceiling should drop it.
    results = find_prospects(ICP(max_award_amount=200_000))
    assert all(
        (p.recent_award_amount is None or p.recent_award_amount <= 200_000)
        for p in results
    )
    assert not any(p.name == "Becker Fabrication" for p in results)


def test_limit_is_respected():
    results = find_prospects(ICP(limit=2))
    assert len(results) <= 2


# --- usaspending source (mocked) ---------------------------------------
@pytest.fixture
def usaspending(monkeypatch):
    monkeypatch.setattr(prospecting.settings, "prospecting_source", "usaspending")
    return monkeypatch


def test_usaspending_source_parses_api(usaspending):
    payload = {"results": [
        {"Recipient Name": "Gamma Systems Inc", "NAICS Code": "541512",
         "Place of Performance State Code": "GA", "Award Amount": 95000,
         "Awarding Agency": "GSA", "recipient_id": "GAMMA-UEI"},
    ]}

    def fake_post(url, json=None, timeout=None):
        assert "usaspending.gov" in url
        assert json["filters"]["naics_codes"]  # ICP naics forwarded
        class R:
            status_code = 200
            def raise_for_status(self): pass
            def json(self): return payload
        return R()

    usaspending.setattr(httpx, "post", fake_post)
    results = find_prospects(ICP(naics_codes=["541512"], state="GA"))
    assert len(results) == 1
    assert results[0].name == "Gamma Systems Inc"
    assert results[0].assessment_link.startswith("http")


# --- API endpoints ------------------------------------------------------
def test_find_endpoint_requires_admin(client):
    assert client.get("/api/prospects/find").status_code == 401


def test_find_endpoint_returns_prospects(client, admin_auth):
    r = client.get("/api/prospects/find?state=GA&limit=5", auth=admin_auth)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    assert body["source"] == "sample"
    assert "assessment_link" in body["prospects"][0]


def test_csv_endpoint(client, admin_auth):
    r = client.get("/api/prospects/find.csv", auth=admin_auth)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "name,fit_score" in r.text
