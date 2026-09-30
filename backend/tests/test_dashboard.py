from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import CashRegister, CashSession, Category, Product, Sale, User
from app.services import dashboard_service
from tests.conftest import UserFactory
from tests.test_cash import add_register, add_session, post_movement
from tests.test_categories import add_category
from tests.test_products import add_product
from tests.test_purchases import buy, create_id, line
from tests.test_purchases import cancel as cancel_purchase
from tests.test_sales import cancel as cancel_sale
from tests.test_sales import item, pay, sell
from tests.test_suppliers import add_supplier

AuthHeaders = Callable[[User], dict[str, str]]

DASHBOARD_URL = "/api/v1/dashboard"


@pytest.fixture
def drinks(db_session: Session) -> Category:
    return add_category(db_session, "Bebidas")


@pytest.fixture
def water(db_session: Session, drinks: Category) -> Product:
    return add_product(
        db_session,
        drinks,
        "AGUA-1",
        name="Agua",
        sale_price=Decimal(2000),
        current_stock=Decimal(50),
    )


@pytest.fixture
def register(db_session: Session) -> CashRegister:
    return add_register(db_session, "Caja Test")


@pytest.fixture
def session(db_session: Session, register: CashRegister, cashier: User) -> CashSession:
    return add_session(db_session, register, cashier, Decimal(100000))


@pytest.fixture
def headers(cashier: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(cashier)


@pytest.fixture
def admin_headers(admin: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(admin)


def get_dashboard(client: TestClient, headers: dict[str, str]) -> Any:
    response = client.get(DASHBOARD_URL, headers=headers)
    assert response.status_code == 200, response.json()
    return response.json()


def set_created_at(db: Session, sale_id: int, value: datetime) -> None:
    db.execute(update(Sale).where(Sale.id == sale_id).values(created_at=value))
    db.expire_all()


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("role", "sections"),
    [
        (
            RoleCode.ADMIN,
            {"sales_today", "recent_sales", "cash_registers", "stock", "recent_purchases"},
        ),
        (RoleCode.CASHIER, {"sales_today", "recent_sales", "cash_registers"}),
        (RoleCode.INVENTORY, {"stock", "recent_purchases"}),
    ],
)
def test_sections_follow_the_permissions_of_their_area(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    role: RoleCode,
    sections: set[str],
) -> None:
    body = get_dashboard(client, auth_headers(make_user(role)))

    assert {name for name, value in body.items() if value is not None} == sections


def test_dashboard_requires_authentication(client: TestClient) -> None:
    assert client.get(DASHBOARD_URL).status_code == 401


# --- Sales ---------------------------------------------------------------------------


def test_sales_today_counts_completed_sales_and_cancelled_apart(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    water: Product,
) -> None:
    sell(client, headers, [item(water, "2")], [pay(db_session, "cash", "4000")])
    sell(
        client,
        headers,
        [item(water, "3")],
        [pay(db_session, "nequi", "1000"), pay(db_session, "cash", "5000")],
    )
    cancelled = sell(client, headers, [item(water)], [pay(db_session, "nequi", "2000")])
    assert cancel_sale(client, admin_headers, cancelled["id"]).status_code == 200

    today = get_dashboard(client, admin_headers)["sales_today"]

    assert today["scope"] == "all"
    assert today["sales_count"] == 2
    assert Decimal(today["total"]) == Decimal(10000)
    assert Decimal(today["average_ticket"]) == Decimal(5000)
    assert today["cancelled_count"] == 1
    assert Decimal(today["cancelled_total"]) == Decimal(2000)
    methods = [
        (m["name"], m["sales_count"], Decimal(m["total"])) for m in today["by_payment_method"]
    ]
    assert methods == [("Efectivo", 2, Decimal(9000)), ("Nequi", 1, Decimal(1000))]
    assert sum(total for *_, total in methods) == Decimal(today["total"])


def test_cashier_sees_only_their_own_sales(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    headers: dict[str, str],
    admin: User,
    admin_headers: dict[str, str],
    water: Product,
) -> None:
    add_session(db_session, add_register(db_session, "Caja Admin"), admin, Decimal(0))
    own = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    sell(client, admin_headers, [item(water, "5")], [pay(db_session, "cash", "10000")])

    body = get_dashboard(client, headers)

    assert body["sales_today"]["scope"] == "own"
    assert body["sales_today"]["sales_count"] == 1
    assert Decimal(body["sales_today"]["total"]) == Decimal(2000)
    assert [sale["id"] for sale in body["recent_sales"]] == [own["id"]]
    assert get_dashboard(client, admin_headers)["sales_today"]["sales_count"] == 2


def test_sales_today_uses_the_business_day(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    headers: dict[str, str],
    admin: User,
    water: Product,
) -> None:
    """23:30 in Bogotá is already the next day in UTC; it belongs to the previous day."""
    late = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    early = sell(client, headers, [item(water, "2")], [pay(db_session, "cash", "4000")])
    set_created_at(db_session, late["id"], datetime(2026, 1, 10, 4, 30, tzinfo=UTC))
    set_created_at(db_session, early["id"], datetime(2026, 1, 10, 5, 30, tzinfo=UTC))

    today = dashboard_service.dashboard(
        db_session, admin, now=datetime(2026, 1, 10, 17, 0, tzinfo=UTC)
    ).sales_today

    assert today is not None
    assert today.business_date.isoformat() == "2026-01-10"
    assert today.sales_count == 1
    assert today.total == Decimal(4000)


def test_sales_today_without_sales(client: TestClient, admin_headers: dict[str, str]) -> None:
    today = get_dashboard(client, admin_headers)["sales_today"]

    assert today["sales_count"] == 0
    assert Decimal(today["total"]) == 0
    assert today["average_ticket"] is None
    assert today["by_payment_method"] == []


def test_recent_sales_are_the_newest_five(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    headers: dict[str, str],
    water: Product,
) -> None:
    ids = [
        sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])["id"]
        for _ in range(6)
    ]

    recent = get_dashboard(client, headers)["recent_sales"]

    assert [sale["id"] for sale in recent] == ids[:0:-1]
    assert recent[0]["cash_register"]["name"] == "Caja Test"


# --- Cash registers ------------------------------------------------------------------


def test_cash_registers_show_who_has_them_open(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    register: CashRegister,
    cashier: User,
    headers: dict[str, str],
    admin_headers: dict[str, str],
) -> None:
    add_register(db_session, "Caja Inactiva", is_active=False)
    response = post_movement(client, session.id, headers, "income", "5000")
    assert response.status_code == 201, response.json()

    registers = {r["name"]: r for r in get_dashboard(client, admin_headers)["cash_registers"]}

    assert "Caja Inactiva" not in registers
    assert registers["Caja Principal"]["open_session"] is None
    opened = registers["Caja Test"]["open_session"]
    assert opened["id"] == session.id
    assert opened["user"]["full_name"] == cashier.full_name
    assert Decimal(opened["expected_cash"]) == Decimal(105000)


def test_expected_cash_requires_cash_supervise(
    client: TestClient, session: CashSession, headers: dict[str, str]
) -> None:
    registers = {r["name"]: r for r in get_dashboard(client, headers)["cash_registers"]}

    assert registers["Caja Test"]["open_session"]["expected_cash"] is None


# --- Stock ---------------------------------------------------------------------------


def test_stock_counts_active_physical_products_by_status(
    client: TestClient,
    db_session: Session,
    drinks: Category,
    water: Product,
    admin_headers: dict[str, str],
) -> None:
    levels = {"min_stock": Decimal(2), "reorder_point": Decimal(5), "target_stock": Decimal(10)}
    add_product(db_session, drinks, "LOW", current_stock=Decimal(4), **levels)
    add_product(db_session, drinks, "CRIT", current_stock=Decimal(1), **levels)
    add_product(db_session, drinks, "OUT-1", current_stock=Decimal(0), **levels)
    add_product(db_session, drinks, "OUT-2", current_stock=Decimal(-1), **levels)
    add_product(db_session, drinks, "OFF", current_stock=Decimal(0), is_active=False, **levels)
    add_product(db_session, drinks, "SERV", type="service", unit_of_measure="page")

    stock = get_dashboard(client, admin_headers)["stock"]

    assert (stock["out_of_stock_count"], stock["critical_count"], stock["low_count"]) == (2, 1, 1)
    assert [p["sku"] for p in stock["most_urgent"]] == ["OUT-1", "OUT-2", "CRIT", "LOW"]
    assert Decimal(stock["most_urgent"][0]["suggested_quantity"]) == Decimal(10)


# --- Purchases -----------------------------------------------------------------------


def test_recent_purchases_leave_out_drafts(
    client: TestClient,
    db_session: Session,
    water: Product,
    admin_headers: dict[str, str],
) -> None:
    supplier = add_supplier(db_session, "Distribuidora", "900123456-7")
    first = buy(client, admin_headers, supplier, line(water))
    second = buy(client, admin_headers, supplier, line(water))
    assert cancel_purchase(client, admin_headers, first["id"]).status_code == 200
    create_id(client, admin_headers, supplier, line(water))

    recent = get_dashboard(client, admin_headers)["recent_purchases"]

    assert [(p["id"], p["status"]) for p in recent] == [
        (second["id"], "confirmed"),
        (first["id"], "cancelled"),
    ]
