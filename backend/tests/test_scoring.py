from app.services.scoring import score_lead


def test_complete_senior_lead_scores_high_and_hot():
    lead = {
        "email": "owner@co.com",
        "phone": "555-1234",
        "company": "Acme LLC",
        "job_title": "Owner",
        "annual_revenue": 2_000_000,
        "employees": 20,
        "readiness_score": 60,
    }
    result = score_lead(lead)
    assert result["score"] >= 70
    assert result["tier"] == "hot"
    assert result["breakdown"]["total"] == result["score"]


def test_sparse_lead_scores_low_and_cold():
    result = score_lead({"email": "x@y.com"})
    assert result["score"] < 40
    assert result["tier"] == "cold"


def test_score_is_capped_at_100():
    lead = {
        "email": "a@b.com", "phone": "1", "company": "C", "job_title": "CEO Founder",
        "annual_revenue": 9_999_999, "employees": 500, "readiness_score": 55,
    }
    assert score_lead(lead)["score"] <= 100


def test_midrange_readiness_beats_extreme_readiness():
    base = {"email": "a@b.com", "company": "C"}
    mid = score_lead({**base, "readiness_score": 60})["breakdown"]["readiness_intent"]
    extreme = score_lead({**base, "readiness_score": 5})["breakdown"]["readiness_intent"]
    assert mid > extreme


def test_no_readiness_gives_zero_intent():
    assert score_lead({"email": "a@b.com"})["breakdown"]["readiness_intent"] == 0
