"""Auth helpers.

Phase 1 (kept for backward compatibility):
- HTTP Basic for the admin dashboard and management API.
- A shared webhook secret for the public website webhook.

Phase 2 (added):
- Hashed API keys with scopes (``Authorization: Bearer gcle_...`` or the
  ``X-API-Key`` header). API keys are accepted on the webhook and, when scoped,
  on the management API — so integrations no longer need the shared secret or
  admin password. The dashboard stays on HTTP Basic.

Precedence for protected endpoints: a valid API key with the required scope, OR
the legacy credential (admin basic / webhook secret). This lets Phase 2 roll out
without breaking existing callers.

Increment 3 adds real user accounts: HTTP Basic now authenticates against the
``users`` table (email + PBKDF2 password) with role enforcement
(``require_admin`` needs the admin role; ``require_viewer`` accepts any active
user). The env ADMIN_USERNAME/ADMIN_PASSWORD remain a permanent bootstrap login
so a fresh deploy can sign in and create the first real accounts.
"""
from __future__ import annotations

import secrets
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import ApiKey, UserRole
from .ratelimit import enforce_login_not_locked, record_login_failure
from .services import apikeys, users

settings = get_settings()
_basic = HTTPBasic(auto_error=True)


def _principal_from_basic(
    username: str, password: str, db: Session, *, need_admin: bool
) -> str | None:
    """Resolve HTTP Basic credentials to a principal string, or None.

    Two accepted sources, in order:
      1. The env bootstrap admin (ADMIN_USERNAME/ADMIN_PASSWORD) — always admin.
      2. A real, active user in the ``users`` table (email + password).
    Raises 403 if ``need_admin`` and the matched user lacks the admin role.
    """
    if secrets.compare_digest(username, settings.admin_username) and secrets.compare_digest(
        password, settings.admin_password
    ):
        return f"admin:{username}"
    user = users.authenticate(db, username, password)
    if user is None:
        return None
    if need_admin and user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires admin role",
        )
    return f"user:{user.email}"


def require_admin(
    request: Request,
    credentials: HTTPBasicCredentials = Depends(_basic),
    db: Session = Depends(get_db),
) -> str:
    key = enforce_login_not_locked(request)
    principal = _principal_from_basic(
        credentials.username, credentials.password, db, need_admin=True
    )
    if principal is None:
        record_login_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return principal


def require_viewer(
    request: Request,
    credentials: HTTPBasicCredentials = Depends(_basic),
    db: Session = Depends(get_db),
) -> str:
    """Any active user (viewer or admin), or the env bootstrap admin."""
    key = enforce_login_not_locked(request)
    principal = _principal_from_basic(
        credentials.username, credentials.password, db, need_admin=False
    )
    if principal is None:
        record_login_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return principal


def _extract_api_key(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if header and header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.headers.get("x-api-key")


def _valid_api_key(request: Request, db: Session, scope: str | None) -> ApiKey | None:
    plaintext = _extract_api_key(request)
    if not plaintext:
        return None
    record = apikeys.verify_key(db, plaintext)
    if record is None:
        return None
    if scope is not None:
        scopes = record.scope_list()
        if scope not in scopes and "*" not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key missing required scope: {scope}",
            )
    return record


def require_webhook_secret(
    request: Request, db: Session = Depends(get_db)
) -> None:
    # Phase 2: accept a scoped API key ...
    if _valid_api_key(request, db, scope="webhook") is not None:
        return
    # ... or the Phase 1 shared secret (header or ?secret=).
    provided = request.headers.get("x-webhook-secret") or request.query_params.get(
        "secret"
    )
    if provided and secrets.compare_digest(provided, settings.webhook_secret):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing webhook secret / API key",
    )


def require_api_scope(scope: str) -> Callable:
    """Dependency factory: require a valid API key with ``scope`` OR admin basic.

    Returns a dependency usable as ``Depends(require_api_scope("leads:read"))``.
    """

    def _dep(request: Request, db: Session = Depends(get_db)) -> str:
        record = _valid_api_key(request, db, scope=scope)
        if record is not None:
            return f"apikey:{record.prefix}"
        # Fall back to HTTP Basic (env admin or an active user).
        key = enforce_login_not_locked(request)
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("basic "):
            import base64

            try:
                raw = base64.b64decode(auth.split(" ", 1)[1]).decode("utf-8")
                user, _, pw = raw.partition(":")
            except Exception:  # noqa: BLE001
                user = pw = ""
            principal = _principal_from_basic(user, pw, db, need_admin=False)
            if principal is not None:
                return principal
        record_login_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Requires a valid API key with scope "
            f"'{scope}' or admin credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    return _dep
