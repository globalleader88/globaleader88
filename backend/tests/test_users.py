from app.services import passwords, users


# --- password hashing ---------------------------------------------------
def test_hash_and_verify_password():
    h = passwords.hash_password("s3cret-pass")
    assert h.startswith("pbkdf2_sha256$")
    assert passwords.verify_password("s3cret-pass", h)
    assert not passwords.verify_password("wrong", h)


def test_hashes_are_salted_and_unique():
    assert passwords.hash_password("same") != passwords.hash_password("same")


def test_verify_rejects_garbage():
    assert not passwords.verify_password("x", "not-a-valid-hash")


def test_empty_password_rejected():
    import pytest

    with pytest.raises(ValueError):
        passwords.hash_password("")


# --- users service ------------------------------------------------------
def test_create_and_authenticate(db):
    users.create_user(db, "Jane@Co.com", "password123", role="viewer", full_name="Jane")
    # Email is normalized to lowercase and auth works.
    u = users.authenticate(db, "jane@co.com", "password123")
    assert u is not None
    assert u.role.value == "viewer"
    assert u.last_login_at is not None


def test_duplicate_email_rejected(db):
    users.create_user(db, "dup@co.com", "password123")
    import pytest

    with pytest.raises(ValueError):
        users.create_user(db, "DUP@co.com", "password123")


def test_inactive_user_cannot_authenticate(db):
    u = users.create_user(db, "off@co.com", "password123")
    users.set_active(db, u.id, False)
    assert users.authenticate(db, "off@co.com", "password123") is None


def test_bootstrap_admin_seeds_once(db):
    users.ensure_bootstrap_admin(db, "admin@co.com", "password123")
    users.ensure_bootstrap_admin(db, "admin@co.com", "password123")
    from app.models import User

    assert db.query(User).count() == 1


# --- users API + role enforcement --------------------------------------
def test_user_endpoints_require_admin(client):
    assert client.post("/api/users", json={"email": "a@b.com", "password": "password123"}).status_code == 401


def test_admin_can_create_and_list_users(client, admin_auth):
    r = client.post(
        "/api/users",
        json={"email": "new@co.com", "password": "password123", "role": "viewer"},
        auth=admin_auth,
    )
    assert r.status_code == 201
    assert r.json()["email"] == "new@co.com"
    assert r.json()["role"] == "viewer"

    listed = client.get("/api/users", auth=admin_auth).json()
    assert any(u["email"] == "new@co.com" for u in listed)
    # Password material is never exposed.
    assert "password" not in listed[0] and "password_hash" not in listed[0]


def test_created_user_can_authenticate_via_basic(client, admin_auth):
    client.post(
        "/api/users",
        json={"email": "real@co.com", "password": "password123", "role": "admin"},
        auth=admin_auth,
    )
    # The new admin user can now hit an admin endpoint with their own creds.
    r = client.get("/api/users", auth=("real@co.com", "password123"))
    assert r.status_code == 200


def test_viewer_cannot_access_admin_endpoint(client, admin_auth):
    client.post(
        "/api/users",
        json={"email": "viewer@co.com", "password": "password123", "role": "viewer"},
        auth=admin_auth,
    )
    # A viewer is authenticated but lacks the admin role -> 403.
    r = client.get("/api/users", auth=("viewer@co.com", "password123"))
    assert r.status_code == 403


def test_duplicate_email_via_api_conflict(client, admin_auth):
    body = {"email": "dupe2@co.com", "password": "password123"}
    assert client.post("/api/users", json=body, auth=admin_auth).status_code == 201
    assert client.post("/api/users", json=body, auth=admin_auth).status_code == 409


def test_short_password_rejected(client, admin_auth):
    r = client.post(
        "/api/users", json={"email": "x@co.com", "password": "short"}, auth=admin_auth
    )
    assert r.status_code == 422


def test_deactivate_user_blocks_login(client, admin_auth):
    uid = client.post(
        "/api/users",
        json={"email": "gone@co.com", "password": "password123", "role": "admin"},
        auth=admin_auth,
    ).json()["id"]
    assert client.delete(f"/api/users/{uid}", auth=admin_auth).status_code == 204
    # Deactivated admin can no longer authenticate.
    assert client.get("/api/users", auth=("gone@co.com", "password123")).status_code == 401


def test_invalid_credentials_rejected(client):
    assert client.get("/api/users", auth=("nobody@co.com", "password123")).status_code == 401
