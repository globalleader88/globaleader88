"""Application configuration, loaded from environment variables.

All settings have sensible defaults so the app boots for local development and
tests without any manual setup. Production values are supplied via the
environment (see .env.example).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Core -----------------------------------------------------------
    app_name: str = "Global Connects Lead Engine"
    environment: str = "development"  # development | production | test
    debug: bool = True

    # --- Database -------------------------------------------------------
    # Full SQLAlchemy URL. If unset it is assembled from the POSTGRES_* parts.
    database_url: str | None = None
    postgres_user: str = "leadengine"
    postgres_password: str = "leadengine"
    postgres_db: str = "leadengine"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    # --- Security -------------------------------------------------------
    # Simple shared-secret auth for the admin dashboard and management API.
    admin_username: str = "admin"
    admin_password: str = "changeme"
    # Websites POST leads to /webhook/lead with this token (header or query).
    webhook_secret: str = "dev-webhook-secret"

    # --- Lead scoring / dedup knobs ------------------------------------
    # Two leads are considered duplicates when their similarity meets/exceeds
    # this threshold (0-100). Email/phone exact matches always win.
    dedup_threshold: int = 85

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
