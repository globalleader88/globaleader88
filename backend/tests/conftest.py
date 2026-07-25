"""Test configuration.

Points the app at a throwaway SQLite database *before* any app module is
imported, so the whole suite runs with no PostgreSQL/Docker required. The models
use portable column types, so this exercises the same schema as production.
"""
from __future__ import annotations

import os
import tempfile

# --- Must run before importing anything under app.* ---------------------
_TMP_DB = os.path.join(tempfile.gettempdir(), "leadengine_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
os.environ["ENVIRONMENT"] = "test"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "testpass"
os.environ["WEBHOOK_SECRET"] = "test-secret"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    """Recreate all tables before each test for full isolation."""
    from app.ratelimit import webhook_limiter

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    webhook_limiter.reset()  # in-memory limiter is a global; clear per test
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_auth():
    return ("admin", "testpass")


@pytest.fixture
def webhook_headers():
    return {"X-Webhook-Secret": "test-secret"}
