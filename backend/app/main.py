"""FastAPI application entrypoint for the Global Connects Lead Engine."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import dashboard, leads, webhook

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup. In production you'd manage schema with Alembic
    # migrations (Phase 2); create_all is safe and idempotent for Phase 1.
    init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Phase 1 lead intake, scoring, dedup, and offer recommendations.",
    lifespan=lifespan,
)

# Allow the static assessment site to POST leads cross-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Phase 2: restrict to the site's domain.
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(leads.router)
app.include_router(webhook.router)


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": settings.app_name, "environment": settings.environment}
