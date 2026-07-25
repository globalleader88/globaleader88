from app.ratelimit import RateLimiter, webhook_limiter


def test_rate_limiter_allows_then_blocks():
    rl = RateLimiter(limit=3, window_seconds=60)
    assert rl.check("ip", now=0) is True
    assert rl.check("ip", now=1) is True
    assert rl.check("ip", now=2) is True
    assert rl.check("ip", now=3) is False  # 4th within window


def test_rate_limiter_window_slides():
    rl = RateLimiter(limit=2, window_seconds=10)
    assert rl.check("ip", now=0) is True
    assert rl.check("ip", now=1) is True
    assert rl.check("ip", now=2) is False
    # After the window passes, capacity frees up.
    assert rl.check("ip", now=12) is True


def test_rate_limiter_keys_are_independent():
    rl = RateLimiter(limit=1, window_seconds=60)
    assert rl.check("a", now=0) is True
    assert rl.check("b", now=0) is True
    assert rl.check("a", now=0) is False


def test_webhook_returns_429_when_over_limit(client, webhook_headers):
    # Shrink the global limiter for this test, then restore.
    orig_limit = webhook_limiter.limit
    webhook_limiter.limit = 2
    webhook_limiter.reset()
    try:
        p = {"email": "rl@c.com", "company": "RL"}
        assert client.post("/webhook/lead", json=p, headers=webhook_headers).status_code == 200
        assert client.post("/webhook/lead", json=p, headers=webhook_headers).status_code == 200
        assert client.post("/webhook/lead", json=p, headers=webhook_headers).status_code == 429
    finally:
        webhook_limiter.limit = orig_limit
        webhook_limiter.reset()
