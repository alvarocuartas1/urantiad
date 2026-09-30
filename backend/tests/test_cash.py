from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import CashMovement, CashRegister, CashSession, User
from tests.conftest import UserFactory

AuthHeaders = Callable[[User], dict[str, str]]

REGISTERS_URL = "/api/v1/cash-registers"
SESSIONS_URL = "/api/v1/cash-sessions"
CURRENT_URL = f"{SESSIONS_URL}/current"


@pytest.fixture
def register(db_session: Session) -> CashRegister:
    return add_register(db_session, "Caja Test")


@pytest.fixture
def cashier_headers(cashier: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(cashier)


@pytest.fixture
def admin_headers(admin: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(admin)


@pytest.fixture
def open_session(db_session: Session, register: CashRegister, cashier: User) -> CashSession:
    """Session of the cashier with 100.000 of initial cash."""
    return add_session(db_session, register, cashier, Decimal(100000))


def add_register(db: Session, name: str, **fields: Any) -> CashRegister:
    register = CashRegister(name=name, **fields)
    db.add(register)
    db.flush()
    return register


def add_session(
    db: Session, register: CashRegister, user: User, opening_amount: Decimal, **fields: Any
) -> CashSession:
    session = CashSession(
        cash_register=register, user=user, opening_amount=opening_amount, **fields
    )
    db.add(session)
    db.flush()
    return session


def movement_url(session_id: int) -> str:
    return f"{SESSIONS_URL}/{session_id}/movements"


def post_movement(
    client: TestClient,
    session_id: int,
    headers: dict[str, str],
    movement_type: str,
    amount: str,
    concept: str = "Movimiento de prueba",
) -> Any:
    return client.post(
        movement_url(session_id),
        json={"movement_type": movement_type, "amount": amount, "concept": concept},
        headers=headers,
    )


# --- Permissions ---------------------------------------------------------------------


def test_default_register_is_seeded(db_session: Session) -> None:
    names = db_session.scalars(select(CashRegister.name)).all()
    assert "Caja Principal" in names


def test_cashier_reads_registers_but_cannot_manage_them(
    client: TestClient, cashier_headers: dict[str, str], register: CashRegister
) -> None:
    assert client.get(REGISTERS_URL, headers=cashier_headers).status_code == 200
    created = client.post(REGISTERS_URL, json={"name": "Caja 9"}, headers=cashier_headers)
    assert created.status_code == 403
    updated = client.patch(
        f"{REGISTERS_URL}/{register.id}", json={"name": "Otra"}, headers=cashier_headers
    )
    assert updated.status_code == 403


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("get", REGISTERS_URL),
        ("post", SESSIONS_URL),
        ("get", SESSIONS_URL),
        ("get", CURRENT_URL),
        ("post", movement_url(1)),
    ],
)
def test_inventory_role_has_no_cash_access(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    method: str,
    url: str,
) -> None:
    headers = auth_headers(make_user(RoleCode.INVENTORY))
    assert client.request(method, url, headers=headers, json={}).status_code == 403


# --- Registers -----------------------------------------------------------------------


def test_admin_creates_and_updates_register(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    created = client.post(
        REGISTERS_URL,
        json={"name": "  Caja Fotocopias ", "description": "Junto a la fotocopiadora"},
        headers=admin_headers,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Caja Fotocopias"
    assert body["is_active"] is True
    assert body["open_session"] is None

    updated = client.patch(
        f"{REGISTERS_URL}/{body['id']}",
        json={"description": None, "is_active": False},
        headers=admin_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["description"] is None
    assert updated.json()["is_active"] is False


def test_register_name_is_unique_regardless_of_case(
    client: TestClient, admin_headers: dict[str, str], register: CashRegister
) -> None:
    response = client.post(REGISTERS_URL, json={"name": "caja TEST"}, headers=admin_headers)
    assert response.status_code == 409
    assert response.json()["code"] == "CASH_REGISTER_NAME_TAKEN"


def test_register_list_shows_who_has_it_open(
    client: TestClient,
    admin_headers: dict[str, str],
    open_session: CashSession,
    cashier: User,
) -> None:
    response = client.get(REGISTERS_URL, params={"search": "caja test"}, headers=admin_headers)
    assert response.status_code == 200
    [item] = response.json()["items"]
    assert item["open_session"]["id"] == open_session.id
    assert item["open_session"]["user"] == {"id": cashier.id, "full_name": cashier.full_name}


def test_open_register_cannot_be_deactivated(
    client: TestClient, admin_headers: dict[str, str], open_session: CashSession
) -> None:
    response = client.patch(
        f"{REGISTERS_URL}/{open_session.cash_register_id}",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CASH_REGISTER_OPEN"


# --- Opening -------------------------------------------------------------------------


def test_cashier_opens_a_register(
    client: TestClient, cashier_headers: dict[str, str], register: CashRegister, cashier: User
) -> None:
    response = client.post(
        SESSIONS_URL,
        json={
            "cash_register_id": register.id,
            "opening_amount": "150000.50",
            "opening_notes": "  Base en billetes ",
        },
        headers=cashier_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "open"
    assert body["cash_register"] == {"id": register.id, "name": "Caja Test"}
    assert body["user"]["id"] == cashier.id
    assert body["opening_notes"] == "Base en billetes"
    assert body["summary"] == {
        "opening_amount": "150000.50",
        "total_income": "0.00",
        "total_withdrawals": "0.00",
        "total_cash_sales": "0.00",
        "total_cash_cancellations": "0.00",
        "expected_cash": "150000.50",
    }

    current = client.get(CURRENT_URL, headers=cashier_headers)
    assert current.status_code == 200
    assert current.json()["id"] == body["id"]


def test_current_session_is_null_without_opening(
    client: TestClient, cashier_headers: dict[str, str]
) -> None:
    response = client.get(CURRENT_URL, headers=cashier_headers)
    assert response.status_code == 200
    assert response.json() is None


def test_register_cannot_have_two_open_sessions(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    open_session: CashSession,
    cashier: User,
) -> None:
    other = auth_headers(make_user(RoleCode.CASHIER))
    response = client.post(
        SESSIONS_URL,
        json={"cash_register_id": open_session.cash_register_id, "opening_amount": "0"},
        headers=other,
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CASH_REGISTER_BUSY"
    assert cashier.full_name in response.json()["detail"]


def test_user_cannot_have_two_open_sessions(
    client: TestClient,
    db_session: Session,
    cashier_headers: dict[str, str],
    open_session: CashSession,
) -> None:
    other_register = add_register(db_session, "Caja Dos")
    response = client.post(
        SESSIONS_URL,
        json={"cash_register_id": other_register.id, "opening_amount": "0"},
        headers=cashier_headers,
    )
    assert response.status_code == 409
    assert response.json()["code"] == "USER_HAS_OPEN_SESSION"


def test_closed_sessions_do_not_block_a_new_opening(
    client: TestClient,
    db_session: Session,
    cashier_headers: dict[str, str],
    register: CashRegister,
    cashier: User,
) -> None:
    add_session(db_session, register, cashier, Decimal(0), status="closed")
    response = client.post(
        SESSIONS_URL,
        json={"cash_register_id": register.id, "opening_amount": "0"},
        headers=cashier_headers,
    )
    assert response.status_code == 201


def test_inactive_register_cannot_be_opened(
    client: TestClient, db_session: Session, cashier_headers: dict[str, str]
) -> None:
    inactive = add_register(db_session, "Caja Vieja", is_active=False)
    response = client.post(
        SESSIONS_URL,
        json={"cash_register_id": inactive.id, "opening_amount": "0"},
        headers=cashier_headers,
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CASH_REGISTER_INACTIVE"


def test_missing_register_cannot_be_opened(
    client: TestClient, cashier_headers: dict[str, str]
) -> None:
    response = client.post(
        SESSIONS_URL,
        json={"cash_register_id": 999999, "opening_amount": "0"},
        headers=cashier_headers,
    )
    assert response.status_code == 422
    assert response.json()["code"] == "CASH_REGISTER_NOT_FOUND"


@pytest.mark.parametrize("amount", ["-1", "10.555", "abc"])
def test_opening_amount_is_validated(
    client: TestClient, cashier_headers: dict[str, str], register: CashRegister, amount: str
) -> None:
    response = client.post(
        SESSIONS_URL,
        json={"cash_register_id": register.id, "opening_amount": amount},
        headers=cashier_headers,
    )
    assert response.status_code == 422


def test_database_rejects_second_open_session_of_a_user(
    db_session: Session, register: CashRegister, cashier: User
) -> None:
    add_session(db_session, register, cashier, Decimal(0))
    other_register = add_register(db_session, "Caja Dos")
    with pytest.raises(IntegrityError, match="uq_cash_sessions_open_user"):
        add_session(db_session, other_register, cashier, Decimal(0))


# --- Movements -----------------------------------------------------------------------


def test_income_and_withdrawal_update_expected_cash(
    client: TestClient, cashier_headers: dict[str, str], open_session: CashSession
) -> None:
    income = post_movement(
        client, open_session.id, cashier_headers, "income", "20000", "  Cambio en monedas "
    )
    assert income.status_code == 201
    assert income.json()["movement"]["concept"] == "Cambio en monedas"
    assert income.json()["session"]["summary"]["expected_cash"] == "120000.00"

    withdrawal = post_movement(client, open_session.id, cashier_headers, "withdrawal", "45000.50")
    assert withdrawal.status_code == 201
    assert withdrawal.json()["session"]["summary"] == {
        "opening_amount": "100000.00",
        "total_income": "20000.00",
        "total_withdrawals": "45000.50",
        "total_cash_sales": "0.00",
        "total_cash_cancellations": "0.00",
        "expected_cash": "74999.50",
    }

    movements = client.get(movement_url(open_session.id), headers=cashier_headers).json()
    assert movements["total"] == 2
    # Newest first.
    assert [m["movement_type"] for m in movements["items"]] == ["withdrawal", "income"]


def test_withdrawal_cannot_exceed_expected_cash(
    client: TestClient,
    db_session: Session,
    cashier_headers: dict[str, str],
    open_session: CashSession,
) -> None:
    response = post_movement(client, open_session.id, cashier_headers, "withdrawal", "100000.01")
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "INSUFFICIENT_CASH"
    assert "$100.000" in body["detail"]
    assert db_session.scalars(select(CashMovement)).all() == []

    # Withdrawing exactly the expected cash leaves the drawer at zero.
    exact = post_movement(client, open_session.id, cashier_headers, "withdrawal", "100000")
    assert exact.json()["session"]["summary"]["expected_cash"] == "0.00"


@pytest.mark.parametrize(
    "body",
    [
        {"movement_type": "income", "amount": "0", "concept": "Cero"},
        {"movement_type": "income", "amount": "-5", "concept": "Negativo"},
        {"movement_type": "income", "amount": "10", "concept": "  "},
        {"movement_type": "sale", "amount": "10", "concept": "Tipo no manual"},
        {"movement_type": "income", "amount": "10"},
    ],
)
def test_movement_body_is_validated(
    client: TestClient,
    cashier_headers: dict[str, str],
    open_session: CashSession,
    body: dict[str, str],
) -> None:
    response = client.post(movement_url(open_session.id), json=body, headers=cashier_headers)
    assert response.status_code == 422


def test_movements_only_in_own_session(
    client: TestClient,
    admin_headers: dict[str, str],
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    open_session: CashSession,
) -> None:
    # The admin supervises the session but cannot move cash in it.
    response = post_movement(client, open_session.id, admin_headers, "income", "1000")
    assert response.status_code == 403
    assert response.json()["code"] == "CASH_SESSION_NOT_OWNED"

    # Another cashier does not even see it.
    other = auth_headers(make_user(RoleCode.CASHIER))
    response = post_movement(client, open_session.id, other, "income", "1000")
    assert response.status_code == 404
    assert response.json()["code"] == "CASH_SESSION_NOT_FOUND"


def test_movements_rejected_in_closed_session(
    client: TestClient,
    db_session: Session,
    cashier_headers: dict[str, str],
    register: CashRegister,
    cashier: User,
) -> None:
    closed = add_session(db_session, register, cashier, Decimal(1000), status="closed")
    response = post_movement(client, closed.id, cashier_headers, "income", "100")
    assert response.status_code == 409
    assert response.json()["code"] == "CASH_SESSION_CLOSED"


# --- Session history -----------------------------------------------------------------


def test_cashier_sees_only_own_sessions(
    client: TestClient,
    db_session: Session,
    make_user: UserFactory,
    cashier_headers: dict[str, str],
    admin_headers: dict[str, str],
    open_session: CashSession,
) -> None:
    other = make_user(RoleCode.CASHIER)
    other_session = add_session(db_session, add_register(db_session, "Caja Dos"), other, Decimal(0))

    own = client.get(SESSIONS_URL, params={"user_id": other.id}, headers=cashier_headers).json()
    assert [s["id"] for s in own["items"]] == [open_session.id]
    detail = client.get(f"{SESSIONS_URL}/{other_session.id}", headers=cashier_headers)
    assert detail.status_code == 404
    movements = client.get(movement_url(other_session.id), headers=cashier_headers)
    assert movements.status_code == 404

    everyone = client.get(SESSIONS_URL, params={"status": "open"}, headers=admin_headers).json()
    assert {s["id"] for s in everyone["items"]} >= {open_session.id, other_session.id}
    by_user = client.get(SESSIONS_URL, params={"user_id": other.id}, headers=admin_headers).json()
    assert [s["id"] for s in by_user["items"]] == [other_session.id]
    detail = client.get(f"{SESSIONS_URL}/{other_session.id}", headers=admin_headers)
    assert detail.status_code == 200


def test_session_list_includes_summaries_and_filters(
    client: TestClient,
    db_session: Session,
    cashier_headers: dict[str, str],
    open_session: CashSession,
    register: CashRegister,
    cashier: User,
) -> None:
    closed = add_session(db_session, register, cashier, Decimal(5000), status="closed")
    db_session.add(
        CashMovement(
            cash_session_id=closed.id,
            movement_type="withdrawal",
            amount=Decimal(2000),
            concept="Pago a proveedor",
            user=cashier,
        )
    )
    db_session.flush()

    response = client.get(
        SESSIONS_URL,
        params={"cash_register_id": register.id, "status": "closed"},
        headers=cashier_headers,
    )
    [item] = response.json()["items"]
    assert item["id"] == closed.id
    assert item["summary"]["expected_cash"] == "3000.00"

    invalid = client.get(
        SESSIONS_URL,
        params={"date_from": "2026-09-30T00:00:00-05:00", "date_to": "2026-09-29T00:00:00-05:00"},
        headers=cashier_headers,
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "INVALID_DATE_RANGE"
