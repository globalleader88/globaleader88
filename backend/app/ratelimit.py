"""A tiny in-memory sliding-window rate limiter (Phase 2).

Good enough to blunt abuse of the public webhook in a single-process deploy.
For multi-process/horizontal scaling, Phase 2+ swaps this for a Redis-backed
limiter behind the same ``RateLimiter`` interface.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, status

from .config import get_settings

settings = get_settings()


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, now: float | None = None) -> bool:
        """Return True if allowed, False if the caller is over the limit."""
        now = time.monotonic() if now is None else now
        cutoff = now - self.window
        with self._lock:
            q = self._hits[key]
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True

    def over_limit(self, key: str, now: float | None = None) -> bool:
        """Read-only: is ``key`` at/over the limit in the current window?"""
        now = time.monotonic() if now is None else now
        cutoff = now - self.window
        with self._lock:
            q = self._hits[key]
            while q and q[0] < cutoff:
                q.popleft()
            return len(q) >= self.limit

    def record(self, key: str, now: float | None = None) -> None:
        """Record one event for ``key`` (used to count auth failures)."""
        now = time.monotonic() if now is None else now
        with self._lock:
            self._hits[key].append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


webhook_limiter = RateLimiter(
    settings.webhook_rate_limit, settings.webhook_rate_window_seconds
)

# Throttles failed logins per client IP to blunt brute-force against HTTP Basic
# (admin + user accounts). Only *failed* attempts are recorded.
auth_failure_limiter = RateLimiter(
    settings.auth_max_failures, settings.auth_fail_window_seconds
)


def _client_key(request: Request) -> str:
    # Honor a proxy's forwarded IP if present, else the socket peer.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def webhook_rate_limit(request: Request) -> None:
    if not settings.rate_limit_enabled:
        return
    if not webhook_limiter.check(_client_key(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again shortly.",
        )


def enforce_login_not_locked(request: Request) -> str:
    """Raise 429 if this IP has too many recent failed logins. Returns the key."""
    key = _client_key(request)
    if settings.rate_limit_enabled and auth_failure_limiter.over_limit(key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
        )
    return key


def record_login_failure(key: str) -> None:
    if settings.rate_limit_enabled:
        auth_failure_limiter.record(key)
