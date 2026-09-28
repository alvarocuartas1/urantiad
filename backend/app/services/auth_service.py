"""Login, session (refresh token) rotation, logout and password change."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import AppError, UnauthorizedError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import RefreshToken, Role, User

INVALID_CREDENTIALS_MESSAGE = "Usuario o contraseña incorrectos."


@dataclass(frozen=True)
class AuthSession:
    user: User
    access_token: str
    expires_in: int
    refresh_token: str


def _invalid_credentials() -> UnauthorizedError:
    return UnauthorizedError(INVALID_CREDENTIALS_MESSAGE, code="INVALID_CREDENTIALS")


def _session_expired() -> UnauthorizedError:
    return UnauthorizedError("La sesión expiró. Inicie sesión nuevamente.", code="SESSION_EXPIRED")


def _user_with_permissions():
    return select(User).options(selectinload(User.role).selectinload(Role.permissions))


def get_active_user(db: Session, user_id: int) -> User | None:
    user = db.scalar(_user_with_permissions().where(User.id == user_id))
    return user if user is not None and user.is_active else None


def revoke_user_sessions(db: Session, user_id: int, *, except_token: str | None = None) -> None:
    """Revoke every open session of a user (optionally keeping the current one)."""
    stmt = (
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    if except_token is not None:
        stmt = stmt.where(RefreshToken.token_hash != hash_refresh_token(except_token))
    db.execute(stmt)


def _issue_session(db: Session, user: User) -> AuthSession:
    settings = get_settings()
    access_token, expires_in = create_access_token(user.id)
    refresh_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(hours=settings.refresh_token_expire_hours),
        )
    )
    return AuthSession(user, access_token, expires_in, refresh_token)


def login(db: Session, username: str, password: str) -> AuthSession:
    settings = get_settings()
    now = datetime.now(UTC)
    # Row lock keeps the failed-attempt counter consistent under concurrent logins.
    user = db.scalar(
        _user_with_permissions()
        .where(User.username == username.strip().lower())
        .with_for_update(of=User)
    )
    if user is None:
        verify_password(password, None)  # constant-time path for unknown usernames
        raise _invalid_credentials()

    if user.locked_until is not None and user.locked_until > now:
        minutes = max(1, round((user.locked_until - now).total_seconds() / 60))
        raise UnauthorizedError(
            f"Cuenta bloqueada temporalmente por intentos fallidos. "
            f"Intente de nuevo en {minutes} minuto(s).",
            code="ACCOUNT_LOCKED",
        )

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        locked = user.failed_login_attempts >= settings.login_max_attempts
        if locked:
            user.failed_login_attempts = 0
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
        db.commit()
        if locked:
            raise UnauthorizedError(
                f"Demasiados intentos fallidos. La cuenta quedó bloqueada por "
                f"{settings.login_lockout_minutes} minutos.",
                code="ACCOUNT_LOCKED",
            )
        raise _invalid_credentials()

    # Same message as a wrong password, so inactive accounts cannot be discovered.
    if not user.is_active:
        raise _invalid_credentials()

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    session = _issue_session(db, user)
    db.commit()
    return session


def refresh_session(db: Session, refresh_token: str) -> AuthSession:
    """Rotate the refresh token: the presented one is revoked and a new session is issued."""
    now = datetime.now(UTC)
    stored = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
        .with_for_update()
    )
    if stored is None:
        raise _session_expired()

    if stored.revoked_at is not None:
        # A rotated token was used again: it may have been stolen, so end every session.
        revoke_user_sessions(db, stored.user_id)
        db.commit()
        raise _session_expired()

    user = get_active_user(db, stored.user_id)
    if stored.expires_at <= now or user is None:
        raise _session_expired()

    stored.revoked_at = now
    session = _issue_session(db, user)
    db.commit()
    return session


def logout(db: Session, refresh_token: str | None) -> None:
    if refresh_token is None:
        return
    db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == hash_refresh_token(refresh_token),
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    db.commit()


def change_password(
    db: Session,
    user: User,
    current_password: str,
    new_password: str,
    current_refresh_token: str | None,
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AppError("La contraseña actual es incorrecta.", code="INVALID_CURRENT_PASSWORD")
    user.password_hash = hash_password(new_password)
    # Other devices must log in again; the session that made the change stays open.
    revoke_user_sessions(db, user.id, except_token=current_refresh_token)
    db.commit()
