"""Password hashing (Phase 2, increment 3).

Uses stdlib PBKDF2-HMAC-SHA256 so we add no dependency (consistent with the
project's dependency-light stance). Format stored in ``password_hash``:

    pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>

A real high-scale deployment may later swap this for argon2/bcrypt behind the
same ``hash_password`` / ``verify_password`` interface.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets

_ALGO = "pbkdf2_sha256"
_ITERATIONS = 240_000


def hash_password(plaintext: str, *, iterations: int = _ITERATIONS) -> str:
    if not plaintext:
        raise ValueError("password must not be empty")
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", plaintext.encode(), bytes.fromhex(salt), iterations)
    return f"{_ALGO}${iterations}${salt}${dk.hex()}"


def verify_password(plaintext: str, stored: str) -> bool:
    try:
        algo, iters_s, salt, hash_hex = stored.split("$")
        if algo != _ALGO:
            return False
        iterations = int(iters_s)
    except (ValueError, AttributeError):
        return False
    dk = hashlib.pbkdf2_hmac("sha256", plaintext.encode(), bytes.fromhex(salt), iterations)
    return hmac.compare_digest(dk.hex(), hash_hex)
