"""Tests for the security-review hardening: login throttling + no user enumeration."""


def test_repeated_failed_logins_are_locked_out(client):
    bad = ("admin", "wrong-password")
    # auth_max_failures defaults to 10 -> 10 failures allowed, 11th blocked.
    for _ in range(10):
        assert client.get("/api/users", auth=bad).status_code == 401
    # Now the IP is locked: further attempts get 429 ...
    assert client.get("/api/users", auth=bad).status_code == 429
    # ... even with correct credentials (brute-force protection is per-IP).
    assert client.get("/api/users", auth=("admin", "testpass")).status_code == 429


def test_successful_logins_are_not_throttled(client, admin_auth):
    # Well-behaved clients making many valid requests are never locked out.
    for _ in range(15):
        assert client.get("/api/users", auth=admin_auth).status_code == 200


def test_unknown_email_returns_401_not_error(client):
    # Goes through the timing-equalizer path; must behave like a normal auth fail.
    r = client.get("/api/users", auth=("ghost@nowhere.com", "whatever123"))
    assert r.status_code == 401


def test_wrong_password_for_real_user_is_401(client, admin_auth):
    client.post(
        "/api/users",
        json={"email": "real@co.com", "password": "correct-password", "role": "admin"},
        auth=admin_auth,
    )
    assert client.get("/api/users", auth=("real@co.com", "nope")).status_code == 401


def test_authenticate_equalizes_missing_vs_wrong(db):
    from app.services import users

    # Unknown user returns None without raising (dummy-hash path exercised).
    assert users.authenticate(db, "missing@co.com", "whatever") is None
    # Known user, wrong password also returns None.
    users.create_user(db, "known@co.com", "the-right-password")
    assert users.authenticate(db, "known@co.com", "the-wrong-password") is None
    assert users.authenticate(db, "known@co.com", "the-right-password") is not None
