"""Database engine, session factory, and declarative base.

Production runs on PostgreSQL. Tests set ``DATABASE_URL`` to a SQLite URL so the
suite runs anywhere with no external services. The models deliberately use
portable column types (String/Integer/Float/DateTime/JSON) so the same schema
works on both engines.
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

_url = settings.resolved_database_url

# SQLite needs a special flag for use across threads (FastAPI/test client).
_connect_args = {"check_same_thread": False} if _url.startswith("sqlite") else {}

engine = create_engine(_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Safe to call repeatedly (idempotent)."""
    from . import models  # noqa: F401  (register models on Base.metadata)

    Base.metadata.create_all(bind=engine)
