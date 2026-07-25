"""FastAPI application entrypoint for the Global Connects Lead Engine."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import analytics, apikeys, dashboard, leads, webhook

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Production manages schema with Alembic migrations (`alembic upgrade head`).
    # For local dev / tests we auto-create tables for a zero-setup boot.
    if settings.auto_create_tables:
        init_db()
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


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": settings.app_name, "environment": settings.environment}
