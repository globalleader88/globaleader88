"""SQLAlchemy ORM models for the Lead Engine."""
from __future__ import annotations

import datetime as dt
import enum

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class LeadStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    qualified = "qualified"
    won = "won"
    lost = "lost"
    duplicate = "duplicate"


class LeadTier(str, enum.Enum):
    hot = "hot"
    warm = "warm"
    cold = "cold"


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # --- Contact / profile ---------------------------------------------
    first_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(64), index=True)
    company: Mapped[str | None] = mapped_column(String(255), index=True)
    job_title: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))

    # --- Firmographics (used by scoring) -------------------------------
    industry: Mapped[str | None] = mapped_column(String(120))
    employees: Mapped[int | None] = mapped_column(Integer)
    annual_revenue: Mapped[float | None] = mapped_column(Float)

    # --- Source / attribution ------------------------------------------
    source: Mapped[str | None] = mapped_column(String(120), index=True)
    campaign: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)

    # --- Assessment payload (from the GovCon readiness funnel) ----------
    # Overall readiness score 0-100 and per-category breakdown, if provided.
    readiness_score: Mapped[float | None] = mapped_column(Float)
    readiness_tier: Mapped[str | None] = mapped_column(String(60))
    assessment: Mapped[dict | None] = mapped_column(JSON)

    # --- Engine outputs -------------------------------------------------
    score: Mapped[int] = mapped_column(Integer, default=0, index=True)
    tier: Mapped[LeadTier] = mapped_column(
        Enum(LeadTier, native_enum=False, length=10), default=LeadTier.cold, index=True
    )
    score_breakdown: Mapped[dict | None] = mapped_column(JSON)
    recommended_offers: Mapped[list | None] = mapped_column(JSON)

    # --- Lifecycle ------------------------------------------------------
    status: Mapped[LeadStatus] = mapped_column(
        Enum(LeadStatus, native_enum=False, length=12),
        default=LeadStatus.new,
        index=True,
    )
    duplicate_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("leads.id"), nullable=True
    )

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    events: Mapped[list["LeadEvent"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan", order_by="LeadEvent.id"
    )

    @property
    def full_name(self) -> str:
        parts = [p for p in (self.first_name, self.last_name) if p]
        return " ".join(parts) if parts else "(no name)"


class LeadEvent(Base):
    """Lightweight audit trail: intake, scoring, dedup, status changes."""

    __tablename__ = "lead_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), index=True)
    kind: Mapped[str] = mapped_column(String(60))
    message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    lead: Mapped[Lead] = relationship(back_populates="events")
