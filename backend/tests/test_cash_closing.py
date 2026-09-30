from collections.abc import Callable
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import CashRegister, CashSession, Category, Product, User
from tests.conftest import UserFactory
from tests.test_cash import CURRENT_URL, SESSIONS_URL, add_register, add_session, post_movement
from tests.test_categories import add_category
from tests.test_products import add_product
from tests.test_sales import cancel, item, pay, post_sale, sell

AuthHeaders = Callable[[User], dict[str, str]]


@pytest.fixture
def register(db_session: Session) -> CashRegister:
    return add_register(db_session, "Caja Test")


@pytest.fixture
def session(db_session: Session, register: CashRegister, cashier: User) -> CashSession:
    """The cashier's open session, with 100.000 of initial cash."""
    return add_session(db_session, register, cashier, Decimal(100000))


@pytest.fixture
def headers(cashier: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(cashier)


@pytest.fixture
def admin_headers(admin: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(admin)


@pytest.fixture
def category(db_session: Session) -> Category:
    return add_category(db_session, "Bebidas")


@pytest.fixture
def water(db_session: Session, category: Category) -> Product:
    """2.000, 10 units."""
    return add_product(
        db_session, category, "AGUA-1", sale_price=Decimal(2000), current_stock=Decimal(10)
    )


def close_url(session_id: int) -> str:
    return f"{SESSIONS_URL}/{session_id}/close"


def summary_url(session_id: int) -> str:
    return f"{SESSIONS_URL}/{session_id}/sales-summary"


def close(
    client: TestClient,
    headers: dict[str, str],
    session_id: int,
    counted: str,
    expected: str,
    notes: str | None = None,
) -> Any:
    body = {"counted_cash": counted, "expected_cash": expected, "closing_notes": notes}
    return client.post(close_url(session_id), json=body, headers=headers)


def session_status(client: TestClient, headers: dict[str, str], session_id: int) -> str:
    return client.get(f"{SESSIONS_URL}/{session_id}", headers=headers).json()["status"]


# --- Closing -------------------------------------------------------------------------


def test_cashier_closes_own_session_with_exact_count(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    cashier: User,
    session: CashSession,
    water: Product,
) -> None:
    sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    post_movement(client, session.id, headers, "income", "5000")

    response = close(client, headers, session.id, "107000", "107000")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "closed"
    closing = body["closing"]
    assert closing["expected_cash"] == "107000.00"
    assert closing["counted_cash"] == "107000.00"
    assert closing["difference"] == "0.00"
    assert closing["closing_notes"] is None
    assert closing["closed_by"]["id"] == cashier.id
    assert closing["closed_at"] is not None
    assert body["summary"]["expected_cash"] == "107000.00"
    assert client.get(CURRENT_URL, headers=headers).json() is None


@pytest.mark.parametrize(
    ("counted", "difference"),
    [("100500", "500.00"), ("99000", "-1000.00")],
    ids=["surplus", "shortage"],
)
def test_closing_stores_the_difference(
    client: TestClient,
    headers: dict[str, str],
    session: CashSession,
    counted: str,
    difference: str,
) -> None:
    response = close(client, headers, session.id, counted, "100000", "  Cambio mal dado ")

    assert response.status_code == 200
    closing = response.json()["closing"]
    assert closing["difference"] == difference
    assert closing["closing_notes"] == "Cambio mal dado"


def test_open_session_has_no_closing(
    client: TestClient, headers: dict[str, str], session: CashSession
) -> None:
    assert client.get(CURRENT_URL, headers=headers).json()["closing"] is None


def test_difference_requires_notes(
    client: TestClient, headers: dict[str, str], session: CashSession
) -> None:
    response = close(client, headers, session.id, "99000", "100000", "   ")

    assert response.status_code == 422
    assert response.json()["code"] == "CLOSING_NOTES_REQUIRED"
    assert session_status(client, headers, session.id) == "open"


def test_closing_is_rejected_if_expected_cash_changed(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    # The cashier counted before this sale entered the drawer.
    sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])

    response = close(client, headers, session.id, "100000", "100000")

    assert response.status_code == 409
    assert response.json()["code"] == "CASH_EXPECTED_CHANGED"
    assert "$102.000" in response.json()["detail"]
    assert session_status(client, headers, session.id) == "open"


def test_session_cannot_be_closed_twice(
    client: TestClient, headers: dict[str, str], session: CashSession
) -> None:
    assert close(client, headers, session.id, "100000", "100000").status_code == 200

    response = close(client, headers, session.id, "100000", "100000")

    assert response.status_code == 409
    assert response.json()["code"] == "CASH_SESSION_CLOSED"


@pytest.mark.parametrize(
    "body",
    [
        {"counted_cash": "-1", "expected_cash": "100000"},
        {"counted_cash": "1.001", "expected_cash": "100000"},
        {"expected_cash": "100000"},
        {"counted_cash": "100000"},
        {"counted_cash": "100000", "expected_cash": "100000", "difference": "0"},
    ],
)
def test_closing_body_is_validated(
    client: TestClient, headers: dict[str, str], session: CashSession, body: dict[str, str]
) -> None:
    assert client.post(close_url(session.id), json=body, headers=headers).status_code == 422


def test_cashier_cannot_close_another_users_session(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    session: CashSession,
) -> None:
    other = auth_headers(make_user(RoleCode.CASHIER))

    response = close(client, other, session.id, "100000", "100000")

    assert response.status_code == 404
    assert response.json()["code"] == "CASH_SESSION_NOT_FOUND"


def test_supervisor_closes_a_session_left_open(
    client: TestClient,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    admin: User,
    cashier: User,
    session: CashSession,
) -> None:
    response = close(client, admin_headers, session.id, "100000", "100000")

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == cashier.id
    assert body["closing"]["closed_by"]["id"] == admin.id
    assert client.get(CURRENT_URL, headers=headers).json() is None


def test_inventory_role_cannot_close(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    session: CashSession,
) -> None:
    headers = auth_headers(make_user(RoleCode.INVENTORY))
    assert close(client, headers, session.id, "100000", "100000").status_code == 403
    assert client.get(summary_url(session.id), headers=headers).status_code == 403


def test_closed_session_accepts_no_sales_or_movements_and_frees_the_register(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    register: CashRegister,
    session: CashSession,
    water: Product,
) -> None:
    assert close(client, headers, session.id, "100000", "100000").status_code == 200

    sale = post_sale(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    assert sale.status_code == 409
    assert sale.json()["code"] == "NO_OPEN_CASH_SESSION"
    movement = post_movement(client, session.id, headers, "income", "1000")
    assert movement.status_code == 409
    assert movement.json()["code"] == "CASH_SESSION_CLOSED"

    reopened = client.post(
        SESSIONS_URL,
        json={"cash_register_id": register.id, "opening_amount": "50000"},
        headers=headers,
    )
    assert reopened.status_code == 201


def test_sessions_filter_by_difference(
    client: TestClient,
    db_session: Session,
    make_user: UserFactory,
    admin_headers: dict[str, str],
    headers: dict[str, str],
    session: CashSession,
) -> None:
    other = make_user(RoleCode.CASHIER)
    exact = add_session(db_session, add_register(db_session, "Caja Dos"), other, Decimal(0))
    close(client, headers, session.id, "99000", "100000", "Faltante")
    close(client, admin_headers, exact.id, "0", "0")

    def ids(has_difference: bool) -> set[int]:
        params = {"has_difference": has_difference, "size": 100}
        page = client.get(SESSIONS_URL, params=params, headers=admin_headers).json()
        return {s["id"] for s in page["items"]}

    assert session.id in ids(True)
    assert exact.id not in ids(True)
    assert exact.id in ids(False)
    assert session.id not in ids(False)


# --- Sales summary -------------------------------------------------------------------


def test_sales_summary_by_payment_method(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    sell(
        client,
        headers,
        [item(water, "3")],
        [pay(db_session, "nequi", "4500"), pay(db_session, "cash", "1500")],
    )
    cancelled = sell(client, headers, [item(water)], [pay(db_session, "nequi", "2000")])
    assert cancel(client, admin_headers, cancelled["id"]).status_code == 200

    response = client.get(summary_url(session.id), headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["sales_count"] == 2
    assert body["total_sales"] == "8000.00"
    totals = [
        (
            m["payment_method"]["code"],
            m["payment_method"]["is_cash"],
            m["payments_count"],
            m["total"],
        )
        for m in body["by_method"]
    ]
    assert totals == [("cash", True, 2, "3500.00"), ("nequi", False, 1, "4500.00")]


def test_sales_summary_of_empty_session(
    client: TestClient, headers: dict[str, str], session: CashSession
) -> None:
    body = client.get(summary_url(session.id), headers=headers).json()
    assert body == {"sales_count": 0, "total_sales": "0.00", "by_method": []}


def test_cancellation_after_closing_does_not_change_the_closed_summary(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    admin: User,
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    assert close(client, headers, session.id, "102000", "102000").status_code == 200
    # Every request of a test shares one transaction, so now() does not advance: the
    # closing is moved back as if it had happened earlier.
    db_session.refresh(session)
    session.closed_at -= timedelta(minutes=1)
    db_session.flush()

    own = add_session(db_session, add_register(db_session, "Caja Admin"), admin, Decimal(10000))
    assert cancel(client, admin_headers, sale["id"]).status_code == 200

    body = client.get(summary_url(session.id), headers=headers).json()
    assert body["sales_count"] == 1
    assert body["total_sales"] == "2000.00"
    # The refund left the admin's drawer; the closed session keeps its figures.
    closed = client.get(f"{SESSIONS_URL}/{session.id}", headers=admin_headers).json()
    assert closed["summary"]["expected_cash"] == "102000.00"
    assert closed["closing"]["expected_cash"] == "102000.00"
    refunded = client.get(f"{SESSIONS_URL}/{own.id}", headers=admin_headers).json()
    assert refunded["summary"]["total_cash_cancellations"] == "2000.00"


def test_sales_summary_of_another_users_session_is_hidden(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    admin_headers: dict[str, str],
    session: CashSession,
) -> None:
    other = auth_headers(make_user(RoleCode.CASHIER))
    assert client.get(summary_url(session.id), headers=other).status_code == 404
    assert client.get(summary_url(session.id), headers=admin_headers).status_code == 200
