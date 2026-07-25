"""User account management (Phase 2, increment 3)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import User, UserRole
from . import passwords


def get_by_email(db: Session, email: str) -> User | None:
    return db.execute(
        select(User).where(func.lower(User.email) == email.strip().lower())
    ).scalars().first()


def create_user(
    db: Session,
    email: str,
    password: str,
    *,
    role: UserRole | str = UserRole.admin,
    full_name: str | None = None,
) -> User:
    if get_by_email(db, email):
        raise ValueError("a user with that email already exists")
    if isinstance(role, str):
        role = UserRole(role)
    user = User(
        email=email.strip().lower(),
        full_name=full_name,
        password_hash=passwords.hash_password(password),
        role=role,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    """Return the active user if the credentials are valid, else None."""
    user = get_by_email(db, email)
    if user is None or not user.active:
        return None
    if not passwords.verify_password(password, user.password_hash):
        return None
    user.last_login_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    return user


def set_active(db: Session, user_id: int, active: bool) -> User | None:
    user = db.get(User, user_id)
    if not user:
        return None
    user.active = active
    db.commit()
    db.refresh(user)
    return user


def set_role(db: Session, user_id: int, role: UserRole | str) -> User | None:
    user = db.get(User, user_id)
    if not user:
        return None
    user.role = UserRole(role) if isinstance(role, str) else role
    db.commit()
    db.refresh(user)
    return user


def ensure_bootstrap_admin(db: Session, email: str, password: str) -> None:
    """Create the initial admin from env config if no users exist yet.

    Lets a fresh deployment log in immediately with ADMIN_USERNAME/ADMIN_PASSWORD,
    then create real accounts. No-op once any user exists.
    """
    has_any = db.scalar(select(func.count(User.id))) or 0
    if has_any:
        return
    db.add(
        User(
            email=email.strip().lower(),
            full_name="Bootstrap Admin",
            password_hash=passwords.hash_password(password),
            role=UserRole.admin,
            active=True,
        )
    )
    db.commit()
