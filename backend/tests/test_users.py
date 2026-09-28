from collections.abc import Callable
from contextlib import nullcontext

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cli
from app.core.errors import ConflictError
from app.core.permissions import RoleCode
from app.core.security import verify_password
from app.models import RefreshToken, Role, User
from app.schemas.user import UserUpdate
from app.services import user_service
from tests.conftest import DEFAULT_PASSWORD, UserFactory

AuthHeaders = Callable[[User], dict[str, str]]

USERS_URL = "/api/v1/users"


def role_id(db: Session, code: RoleCode) -> int:
    return db.scalars(select(Role.id).where(Role.code == code)).one()


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("get", USERS_URL),
        ("post", USERS_URL),
        ("get", f"{USERS_URL}/1"),
        ("patch", f"{USERS_URL}/1"),
        ("put", f"{USERS_URL}/1/password"),
        ("get", "/api/v1/roles"),
    ],
)
def test_cashier_cannot_access_user_administration(
    client: TestClient, cashier: User, auth_headers: AuthHeaders, method: str, url: str
) -> None:
    response = client.request(method, url, headers=auth_headers(cashier), json={})

    assert response.status_code == 403
    assert response.json()["code"] == "PERMISSION_DENIED"


def test_user_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get(USERS_URL).status_code == 401


# --- Listing -------------------------------------------------------------------------


def test_list_users_paginates_and_filters(
    client: TestClient, admin: User, make_user: UserFactory, auth_headers: AuthHeaders
) -> None:
    make_user(RoleCode.CASHIER, username="ana.gomez")
    make_user(RoleCode.CASHIER, username="ana_perez", is_active=False)
    make_user(RoleCode.INVENTORY, username="bodega")
    headers = auth_headers(admin)

    page = client.get(USERS_URL, params={"page": 1, "size": 2}, headers=headers).json()
    assert page["total"] == 4
    assert len(page["items"]) == 2
    assert (page["page"], page["size"]) == (1, 2)

    search = client.get(USERS_URL, params={"search": "ANA"}, headers=headers).json()
    assert {u["username"] for u in search["items"]} == {"ana.gomez", "ana_perez"}

    # "_" is a literal character, not a LIKE wildcard.
    underscore = client.get(USERS_URL, params={"search": "a_p"}, headers=headers).json()
    assert [u["username"] for u in underscore["items"]] == ["ana_perez"]

    active = client.get(USERS_URL, params={"is_active": False}, headers=headers).json()
    assert [u["username"] for u in active["items"]] == ["ana_perez"]


def test_page_size_is_limited(client: TestClient, admin: User, auth_headers: AuthHeaders) -> None:
    response = client.get(USERS_URL, params={"size": 101}, headers=auth_headers(admin))

    assert response.status_code == 422


def test_get_unknown_user_returns_404(
    client: TestClient, admin: User, auth_headers: AuthHeaders
) -> None:
    response = client.get(f"{USERS_URL}/999999", headers=auth_headers(admin))

    assert response.status_code == 404
    assert response.json()["code"] == "USER_NOT_FOUND"


# --- Creation ------------------------------------------------------------------------


def test_create_user(
    client: TestClient, admin: User, auth_headers: AuthHeaders, db_session: Session
) -> None:
    payload = {
        "username": "  Maria.Lopez ",
        "full_name": " María López ",
        "password": "Segura2026!",
        "role_id": role_id(db_session, RoleCode.CASHIER),
    }

    response = client.post(USERS_URL, json=payload, headers=auth_headers(admin))

    body = response.json()
    assert response.status_code == 201
    assert body["username"] == "maria.lopez"
    assert body["full_name"] == "María López"
    assert body["role"]["code"] == "cashier"
    assert body["is_active"] is True
    assert "password" not in response.text
    stored = db_session.get(User, body["id"])
    assert stored is not None
    assert stored.password_hash != "Segura2026!"
    assert verify_password("Segura2026!", stored.password_hash)


def test_create_user_with_duplicate_username_returns_409(
    client: TestClient, admin: User, auth_headers: AuthHeaders, db_session: Session
) -> None:
    payload = {
        "username": "ADMIN",
        "full_name": "Otro",
        "password": "Segura2026!",
        "role_id": role_id(db_session, RoleCode.CASHIER),
    }

    response = client.post(USERS_URL, json=payload, headers=auth_headers(admin))

    assert response.status_code == 409
    assert response.json() == {
        "detail": "El nombre de usuario ya existe.",
        "code": "USERNAME_TAKEN",
    }


@pytest.mark.parametrize(
    "overrides",
    [
        {"username": "ab"},
        {"username": "con espacio"},
        {"full_name": "   "},
        {"password": "1234567"},
    ],
)
def test_create_user_validates_fields(
    client: TestClient,
    admin: User,
    auth_headers: AuthHeaders,
    db_session: Session,
    overrides: dict[str, str],
) -> None:
    payload = {
        "username": "nuevo",
        "full_name": "Nuevo",
        "password": "Segura2026!",
        "role_id": role_id(db_session, RoleCode.CASHIER),
        **overrides,
    }

    response = client.post(USERS_URL, json=payload, headers=auth_headers(admin))

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_create_user_with_unknown_role_returns_422(
    client: TestClient, admin: User, auth_headers: AuthHeaders
) -> None:
    payload = {"username": "nuevo", "full_name": "Nuevo", "password": "Segura2026!", "role_id": 999}

    response = client.post(USERS_URL, json=payload, headers=auth_headers(admin))

    assert response.status_code == 422
    assert response.json()["code"] == "ROLE_NOT_FOUND"


# --- Updates -------------------------------------------------------------------------


def test_update_user_name_and_role(
    client: TestClient,
    admin: User,
    cashier: User,
    auth_headers: AuthHeaders,
    db_session: Session,
) -> None:
    payload = {"full_name": "Cajero Uno", "role_id": role_id(db_session, RoleCode.INVENTORY)}

    response = client.patch(f"{USERS_URL}/{cashier.id}", json=payload, headers=auth_headers(admin))

    assert response.status_code == 200
    assert response.json()["full_name"] == "Cajero Uno"
    assert response.json()["role"]["code"] == "inventory"


def test_deactivating_a_user_revokes_their_sessions(
    client: TestClient,
    admin: User,
    cashier: User,
    auth_headers: AuthHeaders,
    db_session: Session,
) -> None:
    client.post("/api/v1/auth/login", json={"username": "cajero", "password": DEFAULT_PASSWORD})

    response = client.patch(
        f"{USERS_URL}/{cashier.id}", json={"is_active": False}, headers=auth_headers(admin)
    )

    assert response.status_code == 200
    assert response.json()["is_active"] is False
    open_sessions = db_session.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == cashier.id, RefreshToken.revoked_at.is_(None)
        )
    ).all()
    assert open_sessions == []


@pytest.mark.parametrize(
    ("payload_factory", "code"),
    [
        (lambda db: {"is_active": False}, "CANNOT_DEACTIVATE_SELF"),
        (lambda db: {"role_id": role_id(db, RoleCode.CASHIER)}, "CANNOT_CHANGE_OWN_ROLE"),
    ],
)
def test_admin_cannot_lock_themself_out(
    client: TestClient,
    admin: User,
    auth_headers: AuthHeaders,
    db_session: Session,
    payload_factory: Callable[[Session], dict[str, object]],
    code: str,
) -> None:
    response = client.patch(
        f"{USERS_URL}/{admin.id}", json=payload_factory(db_session), headers=auth_headers(admin)
    )

    assert response.status_code == 409
    assert response.json()["code"] == code


def test_another_admin_can_be_demoted(
    client: TestClient, make_user: UserFactory, auth_headers: AuthHeaders, db_session: Session
) -> None:
    admin_a = make_user(RoleCode.ADMIN, username="admin.a")
    admin_b = make_user(RoleCode.ADMIN, username="admin.b")

    response = client.patch(
        f"{USERS_URL}/{admin_b.id}",
        json={"role_id": role_id(db_session, RoleCode.CASHIER)},
        headers=auth_headers(admin_a),
    )

    assert response.status_code == 200


@pytest.mark.parametrize("change", [{"is_active": False}, {"role": RoleCode.CASHIER}])
def test_last_active_admin_cannot_be_removed(
    make_user: UserFactory, db_session: Session, change: dict[str, object]
) -> None:
    # Through the API the actor is always another admin; the service rule is defense in depth
    # for future roles that may receive `users.manage` without being administrators.
    only_admin = make_user(RoleCode.ADMIN, username="admin.a")
    make_user(RoleCode.ADMIN, username="admin.inactive", is_active=False)
    actor = make_user(RoleCode.INVENTORY)
    data = UserUpdate(
        is_active=change.get("is_active"),
        role_id=role_id(db_session, change["role"]) if "role" in change else None,
    )

    with pytest.raises(ConflictError) as exc_info:
        user_service.update_user(db_session, actor, only_admin.id, data)

    assert exc_info.value.code == "LAST_ADMIN"


def test_reset_password_revokes_sessions_and_unlocks(
    client: TestClient,
    admin: User,
    cashier: User,
    auth_headers: AuthHeaders,
    db_session: Session,
) -> None:
    client.post("/api/v1/auth/login", json={"username": "cajero", "password": DEFAULT_PASSWORD})
    cashier.failed_login_attempts = 3
    db_session.flush()

    response = client.put(
        f"{USERS_URL}/{cashier.id}/password",
        json={"new_password": "Restablecida1"},
        headers=auth_headers(admin),
    )

    assert response.status_code == 204
    assert client.post("/api/v1/auth/refresh").status_code == 401
    login = client.post(
        "/api/v1/auth/login", json={"username": "cajero", "password": "Restablecida1"}
    )
    assert login.status_code == 200


# --- Roles ---------------------------------------------------------------------------


def test_list_roles(client: TestClient, admin: User, auth_headers: AuthHeaders) -> None:
    response = client.get("/api/v1/roles", headers=auth_headers(admin))

    roles = {role["code"]: role for role in response.json()}
    assert response.status_code == 200
    assert set(roles) == {"admin", "cashier", "inventory"}
    assert {p["code"] for p in roles["admin"]["permissions"]} == {
        "users.read",
        "users.manage",
        "roles.read",
        "products.read",
        "products.manage",
    }
    assert {p["code"] for p in roles["inventory"]["permissions"]} == {
        "products.read",
        "products.manage",
    }
    assert {p["code"] for p in roles["cashier"]["permissions"]} == {"products.read"}


# --- CLI -----------------------------------------------------------------------------


def test_create_admin_command(db_session: Session, monkeypatch, capsys) -> None:
    answers = iter(["Jefe", "Dueño del negocio"])
    monkeypatch.setattr("builtins.input", lambda _prompt: next(answers))
    monkeypatch.setattr(cli, "getpass", lambda _prompt: "ClaveSegura1")
    monkeypatch.setattr(cli, "SessionLocal", lambda: nullcontext(db_session))

    assert cli.main(["create-admin"]) == 0

    user = db_session.scalars(select(User).where(User.username == "jefe")).one()
    assert user.role.code == "admin"
    assert "creado correctamente" in capsys.readouterr().out


def test_create_admin_command_rejects_invalid_data(
    db_session: Session, monkeypatch, capsys
) -> None:
    monkeypatch.setattr(cli, "getpass", lambda _prompt: "corta")
    monkeypatch.setattr(cli, "SessionLocal", lambda: nullcontext(db_session))

    assert cli.main(["create-admin", "--username", "jefe", "--full-name", "Jefe"]) == 1
    assert "password" in capsys.readouterr().err
