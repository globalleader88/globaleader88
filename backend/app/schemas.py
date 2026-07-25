"""Pydantic schemas for request/response validation."""
from __future__ import annotations

import datetime as dt
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LeadBase(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    company: str | None = None
    job_title: str | None = None
    website: str | None = None
    industry: str | None = None
    employees: int | None = None
    annual_revenue: float | None = None
    source: str | None = None
    campaign: str | None = None
    notes: str | None = None
    readiness_score: float | None = None
    readiness_tier: str | None = None
    assessment: dict[str, Any] | None = None

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email_to_none(cls, v: Any) -> Any:
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


class LeadCreate(LeadBase):
    """Payload accepted by the intake API and website webhook."""

    @field_validator("first_name", "last_name", "company", "phone", mode="after")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class LeadUpdate(BaseModel):
    """Partial update for management endpoints."""

    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    company: str | None = None
    job_title: str | None = None
    industry: str | None = None
    employees: int | None = None
    annual_revenue: float | None = None
    notes: str | None = None
    status: str | None = None


class LeadEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    message: str | None
    created_at: dt.datetime


class LeadOut(LeadBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    score: int
    tier: str
    status: str
    score_breakdown: dict[str, Any] | None = None
    recommended_offers: list[Any] | None = None
    duplicate_of_id: int | None = None
    created_at: dt.datetime
    updated_at: dt.datetime


class IntakeResult(BaseModel):
    """Returned by intake/webhook so callers know what happened."""

    lead: LeadOut
    is_duplicate: bool
    duplicate_of_id: int | None = None
    score: int
    tier: str
    recommended_offers: list[Any] = Field(default_factory=list)


class ImportSummary(BaseModel):
    received: int
    created: int
    duplicates: int
    errors: int
    error_details: list[str] = Field(default_factory=list)


# --- API keys (Phase 2) -------------------------------------------------
class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[str] = Field(default_factory=list)


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    prefix: str
    scopes: str
    active: bool
    created_at: dt.datetime
    last_used_at: dt.datetime | None = None


class ApiKeyCreated(ApiKeyOut):
    # The plaintext key, returned exactly once at creation time.
    api_key: str


# --- Analytics (Phase 2) ------------------------------------------------
class AnalyticsSummary(BaseModel):
    total_leads: int
    active_leads: int
    duplicates: int
    avg_score: float
    by_tier: dict[str, int]
    by_status: dict[str, int]
    by_source: dict[str, int]
    top_offers: list[dict[str, Any]]
