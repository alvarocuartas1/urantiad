from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.permissions import RoleCode
from app.models import RefreshToken, User
from tests.conftest import DEFAULT_PASSWORD, UserFactory

AuthHeaders = Callable[[User], dict[str, str]]

LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/auth/me"


def login(client: TestClient, username: str, password: str = DEFAULT_PASSWORD):
    return client.post(LOGIN_URL, json={"username": username, "password": password})


# --- Login ---------------------------------------------------------------------------


def test_login_returns_token_user_and_refresh_cookie(client: TestClient, admin: User) -> None:
    response = login(client, "  ADMIN ")  # username is case- and whitespace-insensitive

    body = response.json()
    assert response.status_code == 200
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_settings().access_token_expire_minutes * 60
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"]["code"] == "admin"
    assert "users.manage" in body["user"]["permissions"]
    assert "password" not in response.text

    cookie = response.headers["set-cookie"]
    assert "refresh_token=" in cookie
    assert "HttpOnly" in cookie
    assert "Path=/api/v1/auth" in cookie
    assert "samesite=lax" in cookie.lower()


def test_login_updates_last_login(client: TestClient, admin: User, db_session: Session) -> None:
    login(client, "admin")

    db_session.refresh(admin)
    assert admin.last_login_at is not None


@pytest.mark.parametrize(
    ("username", "password"),
    [("admin", "wrong-password"), ("nobody", DEFAULT_PASSWORD)],
)
def test_login_failures_share_the_same_message(
    client: TestClient, admin: User, username: str, password: str
) -> None:
    response = login(client, username, password)

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Usuario o contraseña incorrectos.",
        "code": "INVALID_CREDENTIALS",
    }


def test_inactive_user_cannot_login(client: TestClient, make_user: UserFactory) -> None:
    make_user(RoleCode.CASHIER, username="inactive", is_active=False)

    response = login(client, "inactive")

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"


def test_account_is_locked_after_max_failed_attempts(
    client: TestClient, admin: User, db_session: Session
) -> None:
    max_attempts = get_settings().login_max_attempts
    for _ in range(max_attempts - 1):
        assert login(client, "admin", "wrong").json()["code"] == "INVALID_CREDENTIALS"

    locking_attempt = login(client, "admin", "wrong")
    assert locking_attempt.json()["code"] == "ACCOUNT_LOCKED"

    # Even the correct password is rejected while the lock lasts.
    response = login(client, "admin")
    assert response.status_code == 401
    assert response.json()["code"] == "ACCOUNT_LOCKED"

    # When the lock expires the user can log in again and the counter resets.
    admin.locked_until = datetime.now(UTC) - timedelta(seconds=1)
    db_session.flush()
    assert login(client, "admin").status_code == 200
    db_session.refresh(admin)
    assert admin.failed_login_attempts == 0
    assert admin.locked_until is None


# --- Access token --------------------------------------------------------------------


def test_me_returns_current_user(
    client: TestClient, cashier: User, auth_headers: AuthHeaders
) -> None:
    response = client.get(ME_URL, headers=auth_headers(cashier))

    assert response.status_code == 200
    assert response.json()["username"] == "cajero"
    assert response.json()["permissions"] == [
        "cash.operate",
        "cash_registers.read",
        "customers.manage",
        "customers.read",
        "products.read",
        "sales.create",
        "sales.read",
    ]


def test_me_without_token_returns_401(client: TestClient) -> None:
    response = client.get(ME_URL)

    assert response.status_code == 401
    assert response.json()["code"] == "NOT_AUTHENTICATED"
    assert response.headers["www-authenticate"] == "Bearer"


def _token(user_id: int, *, secret: str | None = None, **overrides: object) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "type": "access", "iat": now, "exp": now + timedelta(minutes=5)}
    payload.update(overrides)
    return jwt.encode(payload, secret or settings.jwt_secret_key.get_secret_value(), "HS256")


@pytest.mark.parametrize(
    "build_token",
    [
        pytest.param(
            lambda uid: _token(uid, exp=datetime.now(UTC) - timedelta(seconds=1)), id="expired"
        ),
        pytest.param(
            lambda uid: _token(uid, secret="another-secret-key-with-32-characters!!"),
            id="bad-signature",
        ),
        pytest.param(lambda uid: _token(uid, type="refresh"), id="wrong-type"),
        pytest.param(lambda uid: "not-a-jwt", id="garbage"),
    ],
)
def test_invalid_access_tokens_are_rejected(
    client: TestClient, admin: User, build_token: Callable[[int], str]
) -> None:
    response = client.get(ME_URL, headers={"Authorization": f"Bearer {build_token(admin.id)}"})

    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_INVALID"


def test_deactivated_user_loses_access_immediately(
    client: TestClient, cashier: User, auth_headers: AuthHeaders, db_session: Session
) -> None:
    headers = auth_headers(cashier)
    cashier.is_active = False
    db_session.flush()

    response = client.get(ME_URL, headers=headers)

    assert response.status_code == 401


# --- Refresh token -------------------------------------------------------------------


def test_refresh_rotates_the_session(client: TestClient, admin: User) -> None:
    login(client, "admin")
    old_cookie = client.cookies.get("refresh_token")

    response = client.post(REFRESH_URL)

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "admin"
    new_cookie = client.cookies.get("refresh_token")
    assert new_cookie and new_cookie != old_cookie
    access = response.json()["access_token"]
    assert client.get(ME_URL, headers={"Authorization": f"Bearer {access}"}).status_code == 200


def test_reusing_a_rotated_refresh_token_revokes_all_sessions(
    client: TestClient, admin: User, db_session: Session
) -> None:
    login(client, "admin")
    stolen = client.cookies.get("refresh_token")
    client.post(REFRESH_URL)  # legitimate rotation
    current = client.cookies.get("refresh_token")

    client.cookies.set("refresh_token", stolen, path="/api/v1/auth")
    reuse = client.post(REFRESH_URL)

    assert reuse.status_code == 401
    assert reuse.json()["code"] == "SESSION_EXPIRED"
    open_sessions = db_session.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == admin.id, RefreshToken.revoked_at.is_(None)
        )
    ).all()
    assert open_sessions == []
    client.cookies.set("refresh_token", current, path="/api/v1/auth")
    assert client.post(REFRESH_URL).status_code == 401


def test_refresh_without_cookie_returns_401(client: TestClient) -> None:
    response = client.post(REFRESH_URL)

    assert response.status_code == 401
    assert response.json()["code"] == "SESSION_EXPIRED"


def test_expired_refresh_token_is_rejected(
    client: TestClient, admin: User, db_session: Session
) -> None:
    login(client, "admin")
    db_session.execute(
        RefreshToken.__table__.update().values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )

    assert client.post(REFRESH_URL).status_code == 401


def test_logout_revokes_the_session(client: TestClient, admin: User) -> None:
    login(client, "admin")
    cookie = client.cookies.get("refresh_token")

    response = client.post(LOGOUT_URL)

    assert response.status_code == 204
    client.cookies.set("refresh_token", cookie, path="/api/v1/auth")
    assert client.post(REFRESH_URL).status_code == 401


# --- Change own password -------------------------------------------------------------


def test_change_own_password(client: TestClient, admin: User) -> None:
    access = login(client, "admin").json()["access_token"]
    headers = {"Authorization": f"Bearer {access}"}

    wrong = client.put(
        f"{ME_URL}/password",
        json={"current_password": "wrong", "new_password": "NuevaClave2026"},
        headers=headers,
    )
    assert wrong.status_code == 400
    assert wrong.json()["code"] == "INVALID_CURRENT_PASSWORD"

    response = client.put(
        f"{ME_URL}/password",
        json={"current_password": DEFAULT_PASSWORD, "new_password": "NuevaClave2026"},
        headers=headers,
    )
    assert response.status_code == 204
    # The session that made the change stays open; the old password stops working.
    assert client.post(REFRESH_URL).status_code == 200
    assert login(client, "admin").status_code == 401
    assert login(client, "admin", "NuevaClave2026").status_code == 200


def test_new_password_must_have_min_length(
    client: TestClient, admin: User, auth_headers: AuthHeaders
) -> None:
    response = client.put(
        f"{ME_URL}/password",
        json={"current_password": DEFAULT_PASSWORD, "new_password": "short"},
        headers=auth_headers(admin),
    )

    assert response.status_code == 422
