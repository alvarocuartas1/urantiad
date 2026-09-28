"""Password hashing (Argon2) and token helpers (JWT access tokens, opaque refresh tokens)."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

password_hasher = PasswordHash.recommended()

# Verified against when the username does not exist, so response time does not reveal it.
_DUMMY_PASSWORD_HASH = password_hasher.hash("urantiad-dummy-password")

ACCESS_TOKEN_TYPE = "access"


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        password_hasher.verify(password, _DUMMY_PASSWORD_HASH)
        return False
    return password_hasher.verify(password, password_hash)


def create_access_token(user_id: int) -> tuple[str, int]:
    """Return the signed JWT and its lifetime in seconds."""
    settings = get_settings()
    now = datetime.now(UTC)
    expires_in = settings.access_token_expire_minutes * 60
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    token = jwt.encode(
        payload, settings.jwt_secret_key.get_secret_value(), algorithm=settings.jwt_algorithm
    )
    return token, expires_in


def decode_access_token(token: str) -> int | None:
    """Return the user id of a valid access token, or None if it is invalid or expired."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "type"]},
        )
    except jwt.PyJWTError:
        return None
    if payload["type"] != ACCESS_TOKEN_TYPE:
        return None
    try:
        return int(payload["sub"])
    except ValueError:
        return None


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    # Refresh tokens are high-entropy random values, so a fast hash is sufficient.
    return hashlib.sha256(token.encode()).hexdigest()
