"""API key generation, hashing, and verification (Phase 2).

Keys look like ``gcle_<prefix>_<secret>``. We store only the SHA-256 hash and a
short non-secret prefix. Verification hashes the presented key and looks it up.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import secrets as _secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ApiKey

_KEY_PREFIX = "gcle"


def hash_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def generate_key() -> tuple[str, str]:
    """Return ``(plaintext, prefix)``. Plaintext is shown to the user once."""
    prefix = _secrets.token_hex(4)  # 8 hex chars, non-secret identifier
    secret = _secrets.token_urlsafe(32)
    plaintext = f"{_KEY_PREFIX}_{prefix}_{secret}"
    return plaintext, prefix


def create_api_key(
    db: Session, name: str, scopes: list[str] | str
) -> tuple[ApiKey, str]:
    """Create and persist a key. Returns ``(record, plaintext)``."""
    if isinstance(scopes, (list, tuple)):
        scopes = ",".join(scopes)
    plaintext, prefix = generate_key()
    record = ApiKey(
        name=name,
        prefix=prefix,
        key_hash=hash_key(plaintext),
        scopes=scopes or "",
        active=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record, plaintext


def verify_key(db: Session, plaintext: str) -> ApiKey | None:
    """Return the active ApiKey matching ``plaintext``, or None."""
    if not plaintext:
        return None
    record = db.execute(
        select(ApiKey).where(ApiKey.key_hash == hash_key(plaintext))
    ).scalars().first()
    if record is None or not record.active:
        return None
    record.last_used_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    return record


def revoke_key(db: Session, key_id: int) -> bool:
    record = db.get(ApiKey, key_id)
    if not record:
        return False
    record.active = False
    db.commit()
    return True
