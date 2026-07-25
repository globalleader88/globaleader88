"""FastAPI application entrypoint for the Global Connects Lead Engine."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import SessionLocal, init_db
from .routers import analytics, apikeys, dashboard, leads, prospects, users, webhook
from .services import users as users_service

settings = get_settings()
logger = logging.getLogger("leadengine")

# Insecure dev defaults that must never be used in production.
_INSECURE_DEFAULTS = {
    "admin_password": "changeme",
    "webhook_secret": "dev-webhook-secret",
}


def _warn_on_insecure_defaults() -> None:
    if settings.environment != "production":
        return
    for attr, default in _INSECURE_DEFAULTS.items():
        if getattr(settings, attr) == default:
            logger.warning(
                "SECURITY: %s is still the insecure default in production — "
                "set a strong value via the environment.",
                attr.upper(),
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warn_on_insecure_defaults()
    # Production manages schema with Alembic migrations (`alembic upgrade head`).
    # For local dev / tests we auto-create tables for a zero-setup boot.
    if settings.auto_create_tables:
        init_db()
    # Seed the first admin account from env so a fresh deploy can log in and
    # then create real users. No-op once any user exists.
    db = SessionLocal()
    try:
        users_service.ensure_bootstrap_admin(
            db, settings.admin_username, settings.admin_password
        )
    except Exception:  # noqa: BLE001 - never block startup on seeding
        db.rollback()
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Phase 1 lead intake, scoring, dedup, and offer recommendations.",
    lifespan=lifespan,
)

# Allow the static assessment site to POST leads cross-origin. Origins are
# configurable (Phase 2): permissive in dev, locked to the funnel in prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(leads.router)
app.include_router(webhook.router)
app.include_router(apikeys.router)
app.include_router(analytics.router)
app.include_router(users.router)
app.include_router(prospects.router)


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": settings.app_name, "environment": settings.environment}
