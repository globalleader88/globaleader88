"""Simple auth helpers.

- HTTP Basic for the admin dashboard and management API.
- A shared webhook secret (header ``X-Webhook-Secret`` or ``?secret=``) for the
  public website webhook, so a static site can post leads without a login.

This is deliberately lightweight for Phase 1. Phase 2 replaces it with proper
API keys / JWT and per-user accounts.
"""
from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .config import get_settings

settings = get_settings()
_basic = HTTPBasic(auto_error=True)


def require_admin(
    credentials: HTTPBasicCredentials = Depends(_basic),
) -> str:
    ok_user = secrets.compare_digest(credentials.username, settings.admin_username)
    ok_pass = secrets.compare_digest(credentials.password, settings.admin_password)
    if not (ok_user and ok_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


def require_webhook_secret(request: Request) -> None:
    provided = request.headers.get("x-webhook-secret") or request.query_params.get(
        "secret"
    )
    if not provided or not secrets.compare_digest(provided, settings.webhook_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing webhook secret",
        )
