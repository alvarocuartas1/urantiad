from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.permissions import PermissionCode, RoleCode
from app.models import CashRegister, CashSession, Category, InventoryMovement, Product, Sale, User
from app.schemas.common import PageParams
from app.services import statistics_service
from tests.conftest import UserFactory
from tests.test_cash import add_register, add_session
from tests.test_categories import add_category
from tests.test_inventory import adjust
from tests.test_products import add_product
from tests.test_reports import revoke
from tests.test_sales import cancel as cancel_sale
from tests.test_sales import item, pay, sell

AuthHeaders = Callable[[User], dict[str, str]]

STATISTICS_URL = "/api/v1/statistics"
MARCH = {"date_from": "2026-03-01", "date_to": "2026-03-31"}


@pytest.fixture
def drinks(db_session: Session) -> Category:
    return add_category(db_session, "Bebidas")


@pytest.fixture
def copies(db_session: Session) -> Category:
    return add_category(db_session, "Fotocopias")


@pytest.fixture
def water(db_session: Session, drinks: Category) -> Product:
    """2.000 without tax, average cost 1.200, 10 in stock."""
    return add_product(
        db_session,
        drinks,
        "AGUA-1",
        name="Agua",
        sale_price=Decimal(2000),
        current_stock=Decimal(10),
        average_cost=Decimal(1200),
    )


@pytest.fixture
def soda(db_session: Session, drinks: Category) -> Product:
    """5.950 with 19 % tax included (950), average cost 3.000, 5 in stock."""
    return add_product(
        db_session,
        drinks,
        "GASEOSA-1",
        name="Gaseosa",
        sale_price=Decimal(5950),
        tax_rate=Decimal(19),
        current_stock=Decimal(5),
        average_cost=Decimal(3000),
    )


@pytest.fixture
def copy_service(db_session: Session, copies: Category) -> Product:
    """200 without tax, cost 50."""
    return add_product(
        db_session,
        copies,
        "COPIA-BN",
        name="Copia",
        type="service",
        unit_of_measure="page",
        sale_price=Decimal(200),
        average_cost=Decimal(50),
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


def get(client: TestClient, headers: dict[str, str], name: str, **params: Any) -> Any:
    response = client.get(f"{STATISTICS_URL}/{name}", params=params, headers=headers)
    assert response.status_code == 200, response.json()
    return response.json()


def move_sale(db: Session, sale_id: int, when: datetime) -> None:
    """Date the sale and its inventory movements at `when`."""
    db.execute(update(Sale).where(Sale.id == sale_id).values(created_at=when))
    db.execute(
        update(InventoryMovement)
        .where(InventoryMovement.sale_id == sale_id)
        .values(created_at=when)
    )


@pytest.fixture
def dated_sales(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    water: Product,
    soda: Product,
    copy_service: Product,
) -> None:
    """In Bogotá time:

    - March 8, 23:30: 2 water, 4.000 (cost 2.400).
    - March 10: 1 soda, 5.950 (950 of tax, cost 3.000); 5 copies, 1.000 (cost 250);
      1 water, cancelled.
    """
    sales = [
        (sell(client, headers, [item(water, "2")], [pay(db_session, "cash", "4000")]), 9, 4),
        (sell(client, headers, [item(soda)], [pay(db_session, "cash", "5950")]), 10, 15),
        (
            sell(client, headers, [item(copy_service, "5")], [pay(db_session, "cash", "1000")]),
            10,
            16,
        ),
    ]
    cancelled = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    assert cancel_sale(client, admin_headers, cancelled["id"]).status_code == 200
    sales.append((cancelled, 10, 17))
    # 04:30 UTC on March 9 is 23:30 of March 8 in Bogotá.
    for sale, day, hour in sales:
        move_sale(db_session, sale["id"], datetime(2026, 3, day, hour, 30, tzinfo=UTC))


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("role", "allowed"),
    [
        (RoleCode.ADMIN, {"sales-trend", "top-products", "inventory-rotation"}),
        (RoleCode.INVENTORY, {"inventory-rotation"}),
        (RoleCode.CASHIER, set()),
    ],
)
def test_statistics_follow_the_permissions_of_their_area(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    role: RoleCode,
    allowed: set[str],
) -> None:
    headers = auth_headers(make_user(role))
    for name in ("sales-trend", "top-products", "inventory-rotation"):
        response = client.get(f"{STATISTICS_URL}/{name}", params=MARCH, headers=headers)
        assert response.status_code == (200 if name in allowed else 403), name


def test_statistics_require_the_period(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get(f"{STATISTICS_URL}/sales-trend", headers=admin_headers)
    assert response.status_code == 422


# --- Sales trend ---------------------------------------------------------------------


@pytest.mark.usefixtures("dated_sales")
def test_daily_trend_fills_days_without_sales(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    body = get(client, admin_headers, "sales-trend", date_from="2026-03-08", date_to="2026-03-10")
    assert (body["date_from"], body["date_to"]) == ("2026-03-08", "2026-03-10")
    assert body["points"] == [
        {
            "period_start": "2026-03-08",
            "sales_count": 1,
            "total": "4000.00",
            "net_total": "4000.00",
            "gross_margin": "1600.00",
        },
        {
            "period_start": "2026-03-09",
            "sales_count": 0,
            "total": "0.00",
            "net_total": "0.00",
            "gross_margin": "0.00",
        },
        {
            "period_start": "2026-03-10",
            "sales_count": 2,
            "total": "6950.00",
            "net_total": "6000.00",
            "gross_margin": "2750.00",
        },
    ]


@pytest.mark.usefixtures("dated_sales")
def test_weekly_trend_covers_whole_weeks_from_monday(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    body = get(
        client,
        admin_headers,
        "sales-trend",
        granularity="week",
        date_from="2026-03-08",
        date_to="2026-03-11",
    )
    assert (body["date_from"], body["date_to"]) == ("2026-03-02", "2026-03-15")
    assert [(p["period_start"], p["sales_count"], p["total"]) for p in body["points"]] == [
        ("2026-03-02", 1, "4000.00"),
        ("2026-03-09", 2, "6950.00"),
    ]


@pytest.mark.usefixtures("dated_sales")
def test_monthly_trend(client: TestClient, admin_headers: dict[str, str]) -> None:
    body = get(
        client,
        admin_headers,
        "sales-trend",
        granularity="month",
        date_from="2026-03-15",
        date_to="2026-04-02",
    )
    assert (body["date_from"], body["date_to"]) == ("2026-03-01", "2026-04-30")
    assert [(p["period_start"], p["sales_count"], p["total"]) for p in body["points"]] == [
        ("2026-03-01", 3, "10950.00"),
        ("2026-04-01", 0, "0.00"),
    ]


@pytest.mark.usefixtures("dated_sales")
def test_margins_are_hidden_without_view_costs(
    client: TestClient, db_session: Session, admin: User, admin_headers: dict[str, str]
) -> None:
    revoke(db_session, admin, PermissionCode.PRODUCTS_VIEW_COSTS)
    trend = get(client, admin_headers, "sales-trend", **MARCH)
    assert {point["gross_margin"] for point in trend["points"]} == {None}
    top = get(client, admin_headers, "top-products", **MARCH)
    assert {row["gross_margin"] for row in top} == {None}


@pytest.mark.parametrize(
    ("params", "code"),
    [
        ({"date_from": "2026-03-10", "date_to": "2026-03-01"}, "INVALID_DATE_RANGE"),
        ({"date_from": "2025-01-01", "date_to": "2026-03-01"}, "STATISTICS_RANGE_TOO_LARGE"),
    ],
)
def test_trend_rejects_invalid_ranges(
    client: TestClient, admin_headers: dict[str, str], params: dict[str, str], code: str
) -> None:
    response = client.get(f"{STATISTICS_URL}/sales-trend", params=params, headers=admin_headers)
    assert response.status_code == 422
    assert response.json()["code"] == code


def test_long_ranges_fit_by_month(client: TestClient, admin_headers: dict[str, str]) -> None:
    body = get(
        client,
        admin_headers,
        "sales-trend",
        granularity="month",
        date_from="2025-01-01",
        date_to="2026-03-01",
    )
    assert len(body["points"]) == 15


# --- Best sellers --------------------------------------------------------------------


@pytest.mark.usefixtures("dated_sales")
def test_top_products_by_quantity_and_by_value(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    by_quantity = get(client, admin_headers, "top-products", **MARCH)
    assert [(row["name"], row["quantity"]) for row in by_quantity] == [
        ("Copia", "5.00"),
        ("Agua", "2.00"),
        ("Gaseosa", "1.00"),
    ]
    by_value = get(client, admin_headers, "top-products", metric="total", limit=2, **MARCH)
    assert [(row["name"], row["total"], row["gross_margin"]) for row in by_value] == [
        ("Gaseosa", "5950.00", "2000.00"),
        ("Agua", "4000.00", "1600.00"),
    ]
    assert by_value[0]["sku"] == "GASEOSA-1"


@pytest.mark.usefixtures("dated_sales")
def test_top_products_by_category_and_period(
    client: TestClient, admin_headers: dict[str, str], copies: Category
) -> None:
    by_category = get(client, admin_headers, "top-products", category_id=copies.id, **MARCH)
    assert [row["name"] for row in by_category] == ["Copia"]
    one_day = get(
        client, admin_headers, "top-products", date_from="2026-03-08", date_to="2026-03-08"
    )
    assert [row["name"] for row in one_day] == ["Agua"]


# --- Inventory rotation --------------------------------------------------------------


@pytest.fixture
def rotation_data(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    drinks: Category,
    water: Product,
    soda: Product,
    copy_service: Product,
) -> None:
    """Period March 1-10 (Bogotá), 10 days:

    - Water: 10 at the start, 4 sold on March 5 at 10:00, 10 received on March 15 (after
      the period): stock 16 now, 6 at the end. Held 10 for 4 d 10 h and 6 for 5 d 14 h:
      77,67 unit-days, average 7,77.
    - New: arrived without stock (20 received on March 6 at 00:00), 5 sold on March 8 at
      10:00. Measured 5 days: 20 for 2 d 10 h and 15 for 2 d 14 h, average 17,42.
    - Soda: 1 sold in February (before the period): 4 all along, no sales in the period.
    - Empty: never had stock. Inactive products and services are left out.
    """
    add_product(db_session, drinks, "VACIO-1", name="Vacío")
    add_product(db_session, drinks, "INACTIVO-1", current_stock=Decimal(3), is_active=False)
    new = add_product(db_session, drinks, "NUEVO-1", name="Nuevo")

    def move_adjustment(response: Any, when: datetime) -> None:
        assert response.status_code == 201, response.json()
        db_session.execute(
            update(InventoryMovement)
            .where(InventoryMovement.id == response.json()["movement"]["id"])
            .values(created_at=when)
        )

    sold = sell(client, headers, [item(water, "4")], [pay(db_session, "cash", "8000")])
    move_sale(db_session, sold["id"], datetime(2026, 3, 5, 15, tzinfo=UTC))
    before = sell(client, headers, [item(soda)], [pay(db_session, "cash", "5950")])
    move_sale(db_session, before["id"], datetime(2026, 2, 20, 15, tzinfo=UTC))
    move_adjustment(
        adjust(client, admin_headers, water, quantity="10"), datetime(2026, 3, 15, 15, tzinfo=UTC)
    )
    move_adjustment(
        adjust(client, admin_headers, new, quantity="20"), datetime(2026, 3, 6, 5, tzinfo=UTC)
    )
    new_sale = sell(client, headers, [item(new, "5")], [pay(db_session, "cash", "5000")])
    move_sale(db_session, new_sale["id"], datetime(2026, 3, 8, 15, tzinfo=UTC))


ROTATION_PERIOD = {"date_from": "2026-03-01", "date_to": "2026-03-10"}


@pytest.mark.usefixtures("rotation_data")
def test_rotation_weights_the_stock_by_time(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    body = get(client, admin_headers, "inventory-rotation", **ROTATION_PERIOD)
    assert body["summary"] == {"products_count": 4, "without_sales_count": 2, "period_days": 10}
    assert [row["name"] for row in body["items"]] == ["Gaseosa", "Nuevo", "Agua", "Vacío"]
    soda, _, water, empty = body["items"]
    assert water == {
        "product_id": water["product_id"],
        "name": "Agua",
        "sku": "AGUA-1",
        "category_name": "Bebidas",
        "unit_of_measure": "unit",
        "units_sold": "4.00",
        "stock_start": "10.00",
        "stock_end": "6.00",
        "average_stock": "7.77",
        "rotation": "0.52",
        "days_of_inventory": "15.00",
        "measured_days": "10.00",
    }
    assert (soda["units_sold"], soda["average_stock"], soda["rotation"]) == ("0.00", "4.00", "0.00")
    assert (soda["days_of_inventory"], soda["measured_days"]) == (None, "10.00")
    assert (empty["average_stock"], empty["rotation"], empty["days_of_inventory"]) == (
        "0.00",
        None,
        None,
    )


@pytest.mark.usefixtures("rotation_data")
def test_rotation_of_a_product_that_arrives_during_the_period_counts_from_its_arrival(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    rows = get(client, admin_headers, "inventory-rotation", **ROTATION_PERIOD)["items"]
    new = next(row for row in rows if row["name"] == "Nuevo")
    assert (new["stock_start"], new["stock_end"], new["units_sold"]) == ("0.00", "15.00", "5.00")
    # 5 sold in 5 days: 15 in stock last 15 days (not 30, as over the whole period).
    assert (new["measured_days"], new["average_stock"]) == ("5.00", "17.42")
    assert (new["rotation"], new["days_of_inventory"]) == ("0.29", "15.00")


def test_rotation_of_the_current_period_is_measured_until_now(
    db_session: Session, water: Product
) -> None:
    items, _, summary = statistics_service.inventory_rotation(
        db_session,
        PageParams(page=1, size=20),
        date_from=date(2026, 3, 1),
        date_to=date(2026, 3, 31),
        # March 5 at 00:00 in Bogotá.
        now=datetime(2026, 3, 5, 5, tzinfo=UTC),
    )
    assert summary.period_days == 5
    assert (items[0].measured_days, items[0].average_stock) == (Decimal("4.00"), Decimal("10.00"))


@pytest.mark.usefixtures("rotation_data")
def test_rotation_fastest_first_and_paginated(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    body = get(client, admin_headers, "inventory-rotation", order="fastest", **ROTATION_PERIOD)
    assert [row["name"] for row in body["items"]] == ["Agua", "Nuevo", "Gaseosa", "Vacío"]
    page = get(client, admin_headers, "inventory-rotation", size=1, page=2, **ROTATION_PERIOD)
    assert (page["total"], [row["name"] for row in page["items"]]) == (4, ["Nuevo"])


@pytest.mark.usefixtures("rotation_data")
def test_rotation_by_category(
    client: TestClient, admin_headers: dict[str, str], copies: Category
) -> None:
    body = get(
        client, admin_headers, "inventory-rotation", category_id=copies.id, **ROTATION_PERIOD
    )
    assert (body["total"], body["summary"]["products_count"]) == (0, 0)


def test_rotation_rejects_a_future_period(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    start = date.today() + timedelta(days=5)
    response = client.get(
        f"{STATISTICS_URL}/inventory-rotation",
        params={"date_from": start.isoformat(), "date_to": (start + timedelta(days=5)).isoformat()},
        headers=admin_headers,
    )
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_DATE_RANGE"
