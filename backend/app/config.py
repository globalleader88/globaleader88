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

    # --- Schema management ---------------------------------------------
    # In production, schema is managed by Alembic migrations. For local dev and
    # the test suite we auto-create tables on startup for zero-setup boot.
    auto_create_tables: bool = True

    # --- CORS (Phase 2) -------------------------------------------------
    # Comma-separated list of allowed origins for the funnel. "*" allows all
    # (fine for dev; set to the funnel's domain in production).
    cors_allow_origins: str = "*"

    # --- Rate limiting (Phase 2) ---------------------------------------
    # Public webhook: max requests per client IP within the window (seconds).
    rate_limit_enabled: bool = True
    webhook_rate_limit: int = 60
    webhook_rate_window_seconds: int = 60

    # --- Integrations (Phase 2) ----------------------------------------
    # Provider selection. "none"/"log" keep everything self-contained (no
    # external calls). Real providers (e.g. "gohighlevel", "sendgrid") plug in
    # later behind the same interfaces and read their own *_API_KEY settings.
    crm_provider: str = "none"
    email_provider: str = "none"
    enrichment_provider: str = "none"
    # Fire an internal notification when a lead scores at/above this.
    hot_lead_notify_threshold: int = 70

    # Outbound-webhook CRM provider (CRM_PROVIDER=webhook). Posts lead JSON here.
    crm_webhook_url: str | None = None
    crm_webhook_timeout_seconds: float = 5.0

    # HTTP enrichment provider (ENRICHMENT_PROVIDER=webhook). POSTs the lead to
    # this URL and merges returned firmographic fields into empty lead fields.
    enrichment_webhook_url: str | None = None
    enrichment_webhook_timeout_seconds: float = 5.0

    # SMTP email provider (EMAIL_PROVIDER=smtp). Sends hot-lead alerts to the
    # sales team and (optionally) a welcome email to the prospect.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    smtp_timeout_seconds: float = 10.0
    email_from: str = "leads@theglobalconnects.com"
    # Comma-separated recipients for internal hot-lead alerts.
    hot_lead_alert_to: str | None = None
    # Send a welcome email to the prospect on intake (opt-in; off by default).
    send_welcome_email: bool = False

    @property
    def hot_lead_alert_recipients(self) -> list[str]:
        raw = (self.hot_lead_alert_to or "").strip()
        return [a.strip() for a in raw.split(",") if a.strip()]

    # --- Background jobs (Phase 2, inc. 2) -----------------------------
    # How post-intake integration dispatch runs:
    #   inline = synchronous, in-request (default; deterministic, simplest)
    #   thread = a background thread pool (keeps intake latency off the path)
    # A real deployment can later add "celery"/"rq" behind the same interface.
    job_queue: str = "inline"
    job_queue_max_workers: int = 4

    @property
    def cors_origins_list(self) -> list[str]:
        raw = self.cors_allow_origins.strip()
        if raw == "*" or not raw:
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

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
