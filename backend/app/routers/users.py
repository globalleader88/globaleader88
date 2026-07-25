"""User account management (admin-authenticated). Phase 2, increment 3."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import User, UserRole
from ..schemas import UserCreate, UserOut, UserUpdate
from ..services import users

router = APIRouter(prefix="/api/users", tags=["users"])

_VALID_ROLES = {r.value for r in UserRole}


def _validate_role(role: str) -> None:
    if role not in _VALID_ROLES:
        raise HTTPException(
            status_code=422, detail=f"role must be one of {sorted(_VALID_ROLES)}"
        )


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> User:
    _validate_role(payload.role)
    try:
        return users.create_user(
            db,
            payload.email,
            payload.password,
            role=payload.role,
            full_name=payload.full_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> list[User]:
    return list(db.execute(select(User).order_by(User.id)).scalars().all())


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.role is not None:
        _validate_role(payload.role)
        users.set_role(db, user_id, payload.role)
    if payload.active is not None:
        users.set_active(db, user_id, payload.active)
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
) -> Response:
    """Soft-delete: deactivate the account (history is preserved)."""
    if users.set_active(db, user_id, False) is None:
        raise HTTPException(status_code=404, detail="User not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
