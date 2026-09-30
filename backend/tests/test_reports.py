import csv
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.permissions import PermissionCode, RoleCode
from app.models import (
    CashRegister,
    CashSession,
    Category,
    Permission,
    Product,
    Sale,
    Supplier,
    User,
)
from app.services import report_export
from tests.conftest import UserFactory
from tests.test_cash import add_register, add_session, post_movement
from tests.test_categories import add_category
from tests.test_products import add_product
from tests.test_purchases import cancel as cancel_purchase
from tests.test_purchases import create_id as create_purchase
from tests.test_purchases import line
from tests.test_sales import cancel as cancel_sale
from tests.test_sales import item, pay, sell
from tests.test_suppliers import add_supplier

AuthHeaders = Callable[[User], dict[str, str]]

REPORTS_URL = "/api/v1/reports"


@pytest.fixture
def drinks(db_session: Session) -> Category:
    return add_category(db_session, "Bebidas")


@pytest.fixture
def copies(db_session: Session) -> Category:
    return add_category(db_session, "Fotocopias")


@pytest.fixture
def water(db_session: Session, drinks: Category) -> Product:
    """2.000 without tax, average cost 1.200."""
    return add_product(
        db_session,
        drinks,
        "AGUA-1",
        name="Agua",
        sale_price=Decimal(2000),
        current_stock=Decimal(10),
        average_cost=Decimal(1200),
        reorder_point=Decimal(12),
        target_stock=Decimal(20),
    )


@pytest.fixture
def soda(db_session: Session, drinks: Category) -> Product:
    """5.950 with 19 % tax included, average cost 3.000."""
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


@pytest.fixture
def keeper(make_user: UserFactory) -> User:
    return make_user(RoleCode.INVENTORY)


@pytest.fixture
def keeper_headers(keeper: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(keeper)


def report(client: TestClient, headers: dict[str, str], name: str, **params: Any) -> Any:
    response = client.get(f"{REPORTS_URL}/{name}", params=params, headers=headers)
    assert response.status_code == 200, response.json()
    return response.json()


def rows_by_label(body: Any) -> dict[str, Any]:
    return {row["label"]: row for row in body["items"]}


def total_of(rows: list[dict[str, Any]], field: str) -> Decimal:
    return sum((Decimal(row[field]) for row in rows), Decimal(0))


def revoke(db: Session, user: User, code: PermissionCode) -> None:
    """Remove `code` from the user's role (undone with the test transaction)."""
    permission = db.scalars(select(Permission).where(Permission.code == code)).one()
    user.role.permissions.remove(permission)
    db.flush()


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("role", "allowed"),
    [
        (RoleCode.ADMIN, {"sales", "purchases", "inventory", "cash"}),
        (RoleCode.INVENTORY, {"purchases", "inventory"}),
        (RoleCode.CASHIER, set()),
    ],
)
def test_reports_follow_the_permissions_of_their_area(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    role: RoleCode,
    allowed: set[str],
) -> None:
    headers = auth_headers(make_user(role))
    for name in ("sales", "purchases", "inventory", "cash"):
        response = client.get(f"{REPORTS_URL}/{name}", headers=headers)
        assert response.status_code == (200 if name in allowed else 403), name


def test_reports_require_authentication(client: TestClient) -> None:
    assert client.get(f"{REPORTS_URL}/sales").status_code == 401


# --- Sales ---------------------------------------------------------------------------


@pytest.fixture
def sales(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    water: Product,
    soda: Product,
    copy_service: Product,
) -> None:
    """Two completed sales and one cancelled:

    - 2 water + 1 soda, cash: 9.950 (950 of tax), cost 5.400.
    - 1 water + 5 copies with 500 of sale discount, Nequi 1.000 + cash 1.500: 2.500,
      cost 1.450. The discount splits 333,33 (water) and 166,67 (copies).
    - 1 water, cancelled: 2.000.
    """
    sell(client, headers, [item(water, "2"), item(soda)], [pay(db_session, "cash", "9950")])
    sell(
        client,
        headers,
        [item(water), item(copy_service, "5")],
        [pay(db_session, "nequi", "1000"), pay(db_session, "cash", "1500")],
        sale_discount="500",
    )
    cancelled = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    assert cancel_sale(client, admin_headers, cancelled["id"]).status_code == 200


@pytest.mark.usefixtures("sales")
def test_sales_summary_excludes_cancelled_sales(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    summary = report(client, admin_headers, "sales")["summary"]
    assert summary == {
        "sales_count": 2,
        "quantity": None,
        "total": "12450.00",
        "discount_total": "500.00",
        "tax_total": "950.00",
        "net_total": "11500.00",
        "cost_total": "6850.00",
        "gross_margin": "4650.00",
        "margin_percent": "40.43",
        "average_ticket": "6225.00",
        "cancelled_count": 1,
        "cancelled_total": "2000.00",
    }


@pytest.mark.usefixtures("sales")
def test_sales_by_product_add_up_to_the_summary(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    body = report(client, admin_headers, "sales", group_by="product")
    assert [row["label"] for row in body["items"]] == ["Gaseosa", "Agua", "Copia"]
    soda, water, copy = body["items"]
    assert water["code"] == "AGUA-1"
    assert (water["quantity"], water["total"], water["sales_count"]) == ("3.00", "5666.67", 2)
    assert (water["cost_total"], water["gross_margin"]) == ("3600.00", "2066.67")
    assert (soda["tax_total"], soda["net_total"], soda["margin_percent"]) == (
        "950.00",
        "5000.00",
        "40.00",
    )
    assert (copy["quantity"], copy["total"], copy["discount_total"]) == ("5.00", "833.33", "166.67")
    for field in ("total", "tax_total", "cost_total", "discount_total"):
        assert total_of(body["items"], field) == Decimal(body["summary"][field])


@pytest.mark.usefixtures("sales")
def test_sales_by_category_user_and_register(
    client: TestClient, admin_headers: dict[str, str], cashier: User, register: CashRegister
) -> None:
    by_category = rows_by_label(report(client, admin_headers, "sales", group_by="category"))
    assert by_category["Bebidas"]["total"] == "11616.67"
    assert by_category["Fotocopias"]["total"] == "833.33"
    assert by_category["Bebidas"]["quantity"] is None

    by_user = report(client, admin_headers, "sales", group_by="user")["items"]
    assert [(row["key"], row["label"], row["sales_count"]) for row in by_user] == [
        (str(cashier.id), cashier.full_name, 2)
    ]
    by_register = report(client, admin_headers, "sales", group_by="cash_register")["items"]
    assert [(row["label"], row["total"]) for row in by_register] == [(register.name, "12450.00")]


@pytest.mark.usefixtures("sales")
def test_sales_by_payment_method(client: TestClient, admin_headers: dict[str, str]) -> None:
    body = report(client, admin_headers, "sales", group_by="payment_method")
    assert [(row["label"], row["sales_count"], row["total"]) for row in body["items"]] == [
        ("Efectivo", 2, "11450.00"),
        ("Nequi", 1, "1000.00"),
    ]
    assert body["items"][0]["cost_total"] is None
    assert total_of(body["items"], "total") == Decimal(body["summary"]["total"])


@pytest.mark.usefixtures("sales")
def test_payment_method_report_rejects_line_filters(
    client: TestClient, admin_headers: dict[str, str], water: Product
) -> None:
    response = client.get(
        f"{REPORTS_URL}/sales",
        params={"group_by": "payment_method", "product_id": water.id},
        headers=admin_headers,
    )
    assert response.status_code == 422
    assert response.json()["code"] == "REPORT_FILTER_NOT_SUPPORTED"


@pytest.mark.usefixtures("sales")
def test_sales_filtered_by_product_count_only_its_lines(
    client: TestClient, admin_headers: dict[str, str], water: Product, drinks: Category
) -> None:
    summary = report(client, admin_headers, "sales", product_id=water.id)["summary"]
    assert (summary["sales_count"], summary["quantity"], summary["total"]) == (2, "3.00", "5666.67")
    assert summary["average_ticket"] is None
    assert (summary["cancelled_count"], summary["cancelled_total"]) == (1, "2000.00")

    by_day = report(client, admin_headers, "sales", category_id=drinks.id)
    assert by_day["summary"]["total"] == "11616.67"


@pytest.mark.usefixtures("sales")
def test_sales_filters_by_user_and_register(
    client: TestClient, admin_headers: dict[str, str], admin: User, register: CashRegister
) -> None:
    assert report(client, admin_headers, "sales", user_id=admin.id)["summary"]["sales_count"] == 0
    summary = report(client, admin_headers, "sales", cash_register_id=register.id)["summary"]
    assert summary["sales_count"] == 2


def test_sales_are_grouped_by_local_day(
    client: TestClient,
    db_session: Session,
    session: CashSession,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    water: Product,
) -> None:
    late = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    # 04:30 UTC on March 10 is 23:30 of March 9 in Bogotá.
    db_session.execute(
        update(Sale)
        .where(Sale.id == late["id"])
        .values(created_at=datetime(2026, 3, 10, 4, 30, tzinfo=UTC))
    )

    body = report(client, admin_headers, "sales", group_by="day")
    assert body["items"][0]["key"] == "2026-03-09"
    assert len(body["items"]) == 2

    march = report(
        client,
        admin_headers,
        "sales",
        group_by="day",
        date_from="2026-03-09T00:00:00-05:00",
        date_to="2026-03-10T00:00:00-05:00",
    )
    assert [(row["key"], row["total"]) for row in march["items"]] == [("2026-03-09", "2000.00")]


def test_invalid_date_range_is_rejected(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get(
        f"{REPORTS_URL}/sales",
        params={"date_from": "2026-03-10T00:00:00-05:00", "date_to": "2026-03-09T00:00:00-05:00"},
        headers=admin_headers,
    )
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_DATE_RANGE"


@pytest.mark.usefixtures("sales")
def test_sales_costs_are_hidden_without_view_costs_permission(
    client: TestClient, db_session: Session, admin: User, admin_headers: dict[str, str]
) -> None:
    revoke(db_session, admin, PermissionCode.PRODUCTS_VIEW_COSTS)
    body = report(client, admin_headers, "sales", group_by="product")
    for values in (body["summary"], *body["items"]):
        assert values["cost_total"] is None
        assert values["gross_margin"] is None
        assert values["margin_percent"] is None
    assert body["summary"]["net_total"] == "11500.00"


@pytest.mark.usefixtures("sales")
def test_report_groups_are_paginated(client: TestClient, admin_headers: dict[str, str]) -> None:
    body = report(client, admin_headers, "sales", group_by="product", size=2, page=2)
    assert (body["total"], body["page"], body["size"]) == (3, 2, 2)
    assert [row["label"] for row in body["items"]] == ["Copia"]
    assert body["summary"]["total"] == "12450.00"


def test_empty_sales_report(client: TestClient, admin_headers: dict[str, str]) -> None:
    body = report(
        client,
        admin_headers,
        "sales",
        date_from="2000-01-01T00:00:00-05:00",
        date_to="2000-01-02T00:00:00-05:00",
    )
    assert body["items"] == []
    assert body["summary"]["total"] == "0.00"
    assert body["summary"]["margin_percent"] is None
    assert body["summary"]["average_ticket"] is None


# --- Purchases -----------------------------------------------------------------------


@pytest.fixture
def andina(db_session: Session) -> Supplier:
    return add_supplier(db_session, "Distribuidora Andina", "900123456-7")


@pytest.fixture
def central(db_session: Session) -> Supplier:
    return add_supplier(db_session, "Mayorista Central", "800765432-1")


@pytest.fixture
def purchases(
    client: TestClient,
    keeper_headers: dict[str, str],
    admin_headers: dict[str, str],
    andina: Supplier,
    central: Supplier,
    water: Product,
    soda: Product,
) -> None:
    """Andina: 10 water at 1.000 (10.000) + 5 soda at 2.000 with 19 % (11.900), and a
    cancelled purchase. Central: 4 water at 1.100 with 400 of discount (4.000). And a draft."""
    for supplier, items in (
        (
            andina,
            [
                line(water, quantity="10", unit_cost="1000"),
                line(soda, quantity="5", unit_cost="2000", tax_rate="19"),
            ],
        ),
        (central, [line(water, quantity="4", unit_cost="1100", discount="400")]),
    ):
        purchase_id = create_purchase(client, keeper_headers, supplier, *items)
        response = client.post(f"/api/v1/purchases/{purchase_id}/confirm", headers=keeper_headers)
        assert response.status_code == 200, response.json()

    cancelled = create_purchase(
        client, keeper_headers, andina, line(water, quantity="1", unit_cost="1000")
    )
    client.post(f"/api/v1/purchases/{cancelled}/confirm", headers=keeper_headers)
    assert cancel_purchase(client, admin_headers, cancelled).status_code == 200
    create_purchase(client, keeper_headers, central, line(soda, quantity="1", unit_cost="9999"))


@pytest.mark.usefixtures("purchases")
def test_purchases_by_supplier(client: TestClient, keeper_headers: dict[str, str]) -> None:
    body = report(client, keeper_headers, "purchases")
    assert [(row["label"], row["code"], row["purchases_count"]) for row in body["items"]] == [
        ("Distribuidora Andina", "900123456-7", 1),
        ("Mayorista Central", "800765432-1", 1),
    ]
    andina = body["items"][0]
    assert (andina["subtotal"], andina["tax_total"], andina["total"]) == (
        "20000.00",
        "1900.00",
        "21900.00",
    )
    assert body["summary"] == {
        "purchases_count": 2,
        "quantity": None,
        "subtotal": "24000.00",
        "discount_total": "400.00",
        "tax_total": "1900.00",
        "total": "25900.00",
        "cancelled_count": 1,
        "cancelled_total": "1000.00",
    }


@pytest.mark.usefixtures("purchases")
def test_purchases_by_product_and_filters(
    client: TestClient, keeper_headers: dict[str, str], water: Product, central: Supplier
) -> None:
    by_product = rows_by_label(report(client, keeper_headers, "purchases", group_by="product"))
    assert (by_product["Agua"]["quantity"], by_product["Agua"]["total"]) == ("14.00", "14000.00")
    assert by_product["Agua"]["purchases_count"] == 2

    summary = report(client, keeper_headers, "purchases", product_id=water.id)["summary"]
    assert (summary["quantity"], summary["total"]) == ("14.00", "14000.00")
    summary = report(client, keeper_headers, "purchases", supplier_id=central.id)["summary"]
    assert (summary["purchases_count"], summary["total"]) == (1, "4000.00")

    by_day = report(client, keeper_headers, "purchases", group_by="day")["items"]
    assert len(by_day) == 1
    assert by_day[0]["total"] == "25900.00"


# --- Inventory -----------------------------------------------------------------------


def test_inventory_by_category(
    client: TestClient,
    db_session: Session,
    keeper_headers: dict[str, str],
    drinks: Category,
    copies: Category,
    water: Product,
    soda: Product,
    copy_service: Product,
) -> None:
    add_product(db_session, drinks, "JUGO-1", name="Jugo", average_cost=Decimal(900))
    add_product(
        db_session,
        drinks,
        "OLD-1",
        current_stock=Decimal(3),
        average_cost=Decimal(1),
        is_active=False,
    )
    add_product(
        db_session,
        copies,
        "RESMA-1",
        name="Resma",
        current_stock=Decimal(-2),
        average_cost=Decimal(15000),
    )

    body = report(client, keeper_headers, "inventory")
    # Services and inactive products are left out; negative stock adds no value.
    assert body["summary"] == {
        "products_count": 4,
        "out_of_stock_count": 2,
        "critical_count": 0,
        "low_count": 1,
        "ok_count": 1,
        "inventory_value": "27000.00",
    }
    by_category = rows_by_label(body)
    assert list(by_category) == ["Bebidas", "Fotocopias"]
    assert (by_category["Bebidas"]["products_count"], by_category["Bebidas"]["low_count"]) == (3, 1)
    assert by_category["Fotocopias"]["inventory_value"] == "0.00"

    filtered = report(client, keeper_headers, "inventory", category_id=copies.id)
    assert filtered["summary"]["products_count"] == 1


def test_inventory_value_is_hidden_without_view_costs_permission(
    client: TestClient,
    db_session: Session,
    keeper: User,
    keeper_headers: dict[str, str],
    water: Product,
) -> None:
    revoke(db_session, keeper, PermissionCode.PRODUCTS_VIEW_COSTS)
    body = report(client, keeper_headers, "inventory")
    assert body["summary"]["inventory_value"] is None
    assert body["items"][0]["inventory_value"] is None


# --- Cash ----------------------------------------------------------------------------


def close(client: TestClient, headers: dict[str, str], session_id: int, counted: str) -> None:
    detail = client.get(f"/api/v1/cash-sessions/{session_id}", headers=headers).json()
    response = client.post(
        f"/api/v1/cash-sessions/{session_id}/close",
        json={
            "counted_cash": counted,
            "expected_cash": detail["summary"]["expected_cash"],
            "closing_notes": "Conteo de prueba",
        },
        headers=headers,
    )
    assert response.status_code == 200, response.json()


def test_cash_report_separates_surplus_and_shortage(
    client: TestClient,
    db_session: Session,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    admin_headers: dict[str, str],
    register: CashRegister,
    water: Product,
) -> None:
    other_register = add_register(db_session, "Caja 2")
    first, second, third = (make_user(RoleCode.CASHIER) for _ in range(3))

    # First: 50.000 + 10.000 income - 5.000 withdrawal + 2.000 sale = 57.000, counts 55.000.
    one = add_session(db_session, register, first, Decimal(50000))
    first_headers = auth_headers(first)
    post_movement(client, one.id, first_headers, "income", "10000")
    post_movement(client, one.id, first_headers, "withdrawal", "5000")
    sell(client, first_headers, [item(water)], [pay(db_session, "cash", "2000")])
    close(client, first_headers, one.id, "55000")
    # Second: 20.000, counts 23.000 (surplus 3.000).
    two = add_session(db_session, other_register, second, Decimal(20000))
    close(client, auth_headers(second), two.id, "23000")
    # Third: still open with 10.000.
    add_session(db_session, register, third, Decimal(10000))

    body = report(client, admin_headers, "cash", group_by="cash_register")
    assert body["summary"] == {
        "sessions_count": 3,
        "open_count": 1,
        "opening_total": "80000.00",
        "income_total": "10000.00",
        "withdrawals_total": "5000.00",
        "cash_sales_total": "2000.00",
        "cash_cancellations_total": "0.00",
        "expected_cash": "77000.00",
        "counted_cash": "78000.00",
        "surplus_total": "3000.00",
        "shortage_total": "2000.00",
        "difference_total": "1000.00",
        "sessions_with_difference": 2,
    }
    by_register = rows_by_label(body)
    assert list(by_register) == ["Caja 2", register.name]
    assert (
        by_register[register.name]["sessions_count"],
        by_register["Caja 2"]["surplus_total"],
    ) == (
        2,
        "3000.00",
    )

    by_user = report(client, admin_headers, "cash", group_by="user", user_id=first.id)["items"]
    assert [(row["label"], row["shortage_total"]) for row in by_user] == [
        (first.full_name, "2000.00")
    ]
    by_day = report(client, admin_headers, "cash")["items"]
    assert len(by_day) == 1
    assert by_day[0]["sessions_count"] == 3


# --- CSV export ----------------------------------------------------------------------

SEPTEMBER = {"date_from": "2026-09-01T00:00:00-05:00", "date_to": "2026-10-01T00:00:00-05:00"}


def export(client: TestClient, headers: dict[str, str], name: str, **params: Any) -> Any:
    return client.get(f"{REPORTS_URL}/{name}/export", params=params, headers=headers)


def read_csv(response: Any) -> list[list[str]]:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.content.startswith(b"\xef\xbb\xbf")  # BOM: Excel reads UTF-8
    return list(csv.reader(response.content.decode("utf-8-sig").splitlines(), delimiter=";"))


def filename(response: Any) -> str:
    return response.headers["content-disposition"].removeprefix("attachment; filename=")


@pytest.mark.usefixtures("sales")
def test_sales_export_has_every_group_and_the_total(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = export(client, admin_headers, "sales", group_by="product", **SEPTEMBER)
    rows = read_csv(response)
    assert filename(response) == '"ventas-por-producto_2026-09-01_2026-09-30.csv"'
    assert rows[0] == [
        "Producto",
        "SKU",
        "Ventas",
        "Cantidad",
        "Descuentos",
        "IVA",
        "Sin IVA",
        "Total",
        "Costo",
        "Margen bruto",
        "Margen %",
    ]
    # The same data and order as the report, amounts with decimal comma.
    assert rows[1] == [
        "Gaseosa", "GASEOSA-1", "1", "1,00", "0,00", "950,00", "5000,00", "5950,00",
        "3000,00", "2000,00", "40,00",
    ]  # fmt: skip
    assert [row[0] for row in rows[1:]] == ["Gaseosa", "Agua", "Copia", "Total"]
    assert rows[-1] == [
        "Total", "", "2", "", "500,00", "950,00", "11500,00", "12450,00", "6850,00",
        "4650,00", "40,43",
    ]  # fmt: skip


@pytest.mark.usefixtures("sales")
def test_export_is_not_limited_to_one_page_but_has_a_maximum(
    client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(report_export, "EXPORT_LIMIT", 3)
    rows = read_csv(export(client, admin_headers, "sales", group_by="product", size=1))
    assert len(rows) == 5  # header + 3 products + total

    monkeypatch.setattr(report_export, "EXPORT_LIMIT", 2)
    response = export(client, admin_headers, "sales", group_by="product")
    assert response.status_code == 422
    assert response.json()["code"] == "REPORT_TOO_LARGE"


@pytest.mark.usefixtures("sales")
def test_sales_export_by_payment_method_and_without_costs(
    client: TestClient,
    db_session: Session,
    admin: User,
    admin_headers: dict[str, str],
    water: Product,
) -> None:
    rows = read_csv(export(client, admin_headers, "sales", group_by="payment_method"))
    assert rows == [
        ["Método de pago", "Ventas", "Total"],
        ["Efectivo", "2", "11450,00"],
        ["Nequi", "1", "1000,00"],
        ["Total", "2", "12450,00"],
    ]
    response = export(
        client, admin_headers, "sales", group_by="payment_method", product_id=water.id
    )
    assert response.status_code == 422
    assert response.json()["code"] == "REPORT_FILTER_NOT_SUPPORTED"

    revoke(db_session, admin, PermissionCode.PRODUCTS_VIEW_COSTS)
    header = read_csv(export(client, admin_headers, "sales"))[0]
    assert header == ["Día", "Ventas", "Descuentos", "IVA", "Sin IVA", "Total"]


@pytest.mark.parametrize(
    ("role", "allowed"),
    [
        (RoleCode.INVENTORY, {"purchases", "inventory"}),
        (RoleCode.CASHIER, set()),
    ],
)
def test_exports_follow_the_permissions_of_their_report(
    client: TestClient,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    role: RoleCode,
    allowed: set[str],
) -> None:
    headers = auth_headers(make_user(role))
    for name in ("sales", "purchases", "inventory", "cash"):
        assert export(client, headers, name).status_code == (200 if name in allowed else 403)


@pytest.mark.usefixtures("purchases")
def test_purchases_and_inventory_exports(
    client: TestClient, keeper_headers: dict[str, str]
) -> None:
    response = export(client, keeper_headers, "purchases", **SEPTEMBER)
    rows = read_csv(response)
    assert filename(response) == '"compras-por-proveedor_2026-09-01_2026-09-30.csv"'
    assert rows[0][:3] == ["Proveedor", "Documento", "Compras"]
    assert rows[1][:2] == ["Distribuidora Andina", "900123456-7"]
    assert rows[-1] == ["Total", "", "2", "400,00", "24000,00", "1900,00", "25900,00"]

    response = export(client, keeper_headers, "inventory")
    rows = read_csv(response)
    assert filename(response).startswith('"inventario-por-categoria_')
    assert rows[0][-1] == "Valor al costo"
    assert rows[-1][0] == "Total"


def test_cash_export_keeps_the_sign_of_the_difference(
    client: TestClient,
    db_session: Session,
    cashier: User,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    register: CashRegister,
) -> None:
    one = add_session(db_session, register, cashier, Decimal(50000))
    close(client, headers, one.id, "48000")

    response = export(client, admin_headers, "cash", group_by="cash_register")
    rows = read_csv(response)
    assert filename(response) == '"caja-por-caja.csv"'
    by_header = dict(zip(rows[0], rows[1], strict=True))
    assert by_header["Caja"] == register.name
    assert (by_header["Faltantes"], by_header["Diferencia neta"]) == ("2000,00", "-2000,00")
    assert rows[-1][0] == "Total"
