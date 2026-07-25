"""API key management (admin-authenticated)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import ApiKey
from ..schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyOut  # noqa: F401
from ..services import apikeys

router = APIRouter(prefix="/api/keys", tags=["api-keys"])

# Scopes an admin may grant. "*" grants all.
VALID_SCOPES = {"*", "webhook", "leads:read", "leads:write", "analytics:read"}


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_key(
    payload: ApiKeyCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> ApiKeyCreated:
    bad = set(payload.scopes) - VALID_SCOPES
    if bad:
        raise HTTPException(status_code=422, detail=f"Unknown scopes: {sorted(bad)}")
    record, plaintext = apikeys.create_api_key(db, payload.name, payload.scopes)
    base = ApiKeyOut.model_validate(record)
    return ApiKeyCreated(**base.model_dump(), api_key=plaintext)


@router.get("", response_model=list[ApiKeyOut])
def list_keys(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> list[ApiKey]:
    return list(db.execute(select(ApiKey).order_by(ApiKey.id)).scalars().all())


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_key(
    key_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> None:
    if not apikeys.revoke_key(db, key_id):
        raise HTTPException(status_code=404, detail="API key not found")
