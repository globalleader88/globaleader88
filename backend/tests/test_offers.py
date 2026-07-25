from app.services.offers import recommend_offers


def test_low_readiness_recommends_registration_first():
    offers = recommend_offers({"readiness_score": 25}, score=40)
    assert offers[0]["key"] == "registration_onboarding"


def test_mid_readiness_recommends_certification():
    offers = recommend_offers({"readiness_score": 55}, score=50)
    assert offers[0]["key"] == "certification_advisory"


def test_high_readiness_recommends_proposal_retainer_or_call():
    offers = recommend_offers({"readiness_score": 85}, score=60)
    keys = [o["key"] for o in offers]
    assert "proposal_retainer" in keys


def test_no_assessment_leads_with_strategy_call():
    offers = recommend_offers({}, score=30)
    assert offers[0]["key"] == "strategy_call"


def test_hot_lead_surfaces_strategy_call_first():
    offers = recommend_offers({"readiness_score": 55}, score=80)
    assert offers[0]["key"] == "strategy_call"


def test_offers_have_no_duplicates():
    offers = recommend_offers({"readiness_score": 85}, score=90)
    keys = [o["key"] for o in offers]
    assert len(keys) == len(set(keys))
    for o in offers:
        assert {"name", "pitch", "price_hint"} <= set(o)
