from app.services import apikeys


def test_generate_and_verify_key(db):
    record, plaintext = apikeys.create_api_key(db, "test", ["webhook"])
    assert plaintext.startswith("gcle_")
    assert record.key_hash != plaintext  # only the hash is stored
    assert apikeys.verify_key(db, plaintext) is not None
    assert apikeys.verify_key(db, "wrong") is None


def test_revoked_key_does_not_verify(db):
    record, plaintext = apikeys.create_api_key(db, "test", ["webhook"])
    apikeys.revoke_key(db, record.id)
    assert apikeys.verify_key(db, plaintext) is None


def test_create_key_requires_admin(client):
    assert client.post("/api/keys", json={"name": "x", "scopes": []}).status_code == 401


def test_create_list_revoke_key_via_api(client, admin_auth):
    r = client.post(
        "/api/keys", json={"name": "integration", "scopes": ["webhook"]}, auth=admin_auth
    )
    assert r.status_code == 201
    body = r.json()
    assert body["api_key"].startswith("gcle_")
    key_id = body["id"]

    listed = client.get("/api/keys", auth=admin_auth).json()
    assert any(k["id"] == key_id for k in listed)
    # Listing never exposes the secret.
    assert "api_key" not in listed[0]

    assert client.delete(f"/api/keys/{key_id}", auth=admin_auth).status_code == 204


def test_unknown_scope_rejected(client, admin_auth):
    r = client.post(
        "/api/keys", json={"name": "x", "scopes": ["bogus"]}, auth=admin_auth
    )
    assert r.status_code == 422


def test_api_key_authenticates_webhook(client, admin_auth):
    key = client.post(
        "/api/keys", json={"name": "wh", "scopes": ["webhook"]}, auth=admin_auth
    ).json()["api_key"]
    r = client.post(
        "/webhook/lead",
        json={"email": "viakey@c.com", "company": "KeyCo"},
        headers={"Authorization": f"Bearer {key}"},
    )
    assert r.status_code == 200


def test_api_key_scope_enforced_on_analytics(client, admin_auth):
    # A webhook-only key must NOT access analytics.
    key = client.post(
        "/api/keys", json={"name": "wh", "scopes": ["webhook"]}, auth=admin_auth
    ).json()["api_key"]
    r = client.get("/api/analytics/summary", headers={"X-API-Key": key})
    assert r.status_code == 403

    # A key with the right scope succeeds.
    key2 = client.post(
        "/api/keys", json={"name": "an", "scopes": ["analytics:read"]}, auth=admin_auth
    ).json()["api_key"]
    r2 = client.get("/api/analytics/summary", headers={"X-API-Key": key2})
    assert r2.status_code == 200


def test_wildcard_scope_grants_all(client, admin_auth):
    key = client.post(
        "/api/keys", json={"name": "root", "scopes": ["*"]}, auth=admin_auth
    ).json()["api_key"]
    assert client.get("/api/analytics/summary", headers={"X-API-Key": key}).status_code == 200
