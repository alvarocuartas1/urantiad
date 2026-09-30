from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import Category, Product, ProductType, StockStatus, User
from tests.conftest import UserFactory
from tests.test_categories import add_category

AuthHeaders = Callable[[User], dict[str, str]]

PRODUCTS_URL = "/api/v1/products"


@pytest.fixture
def category(db_session: Session) -> Category:
    return add_category(db_session, "Bebidas")


@pytest.fixture
def manager_headers(make_user: UserFactory, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(make_user(RoleCode.INVENTORY))


def product_payload(category: Category, **overrides: Any) -> dict[str, Any]:
    return {
        "sku": "beb-001",
        "barcode": "7702004003508",
        "name": "Gaseosa cola 400 ml",
        "category_id": category.id,
        "tax_rate": "19",
        "sale_price": "2500",
        "min_stock": "5",
        "reorder_point": "10",
        "target_stock": "20",
        **overrides,
    }


def add_product(db: Session, category: Category, sku: str, **fields: Any) -> Product:
    product = Product(
        sku=sku,
        name=fields.pop("name", sku),
        category=category,
        unit_of_measure=fields.pop("unit_of_measure", "unit"),
        sale_price=fields.pop("sale_price", Decimal(1000)),
        **fields,
    )
    db.add(product)
    db.flush()
    return product


# --- Permissions ---------------------------------------------------------------------


def test_cashier_can_read_but_not_manage_products(
    client: TestClient, category: Category, cashier: User, auth_headers: AuthHeaders
) -> None:
    headers = auth_headers(cashier)

    assert client.get(PRODUCTS_URL, headers=headers).status_code == 200
    created = client.post(PRODUCTS_URL, json=product_payload(category), headers=headers)
    assert created.status_code == 403
    assert client.patch(f"{PRODUCTS_URL}/1", json={}, headers=headers).status_code == 403


def test_costs_are_hidden_without_view_costs_permission(
    client: TestClient,
    db_session: Session,
    category: Category,
    cashier: User,
    manager_headers: dict[str, str],
    auth_headers: AuthHeaders,
) -> None:
    product = add_product(db_session, category, "BEB-1", average_cost=Decimal(700))
    url = f"{PRODUCTS_URL}/{product.id}"

    as_cashier = client.get(url, headers=auth_headers(cashier)).json()
    listed = client.get(PRODUCTS_URL, headers=auth_headers(cashier)).json()["items"][0]
    as_manager = client.get(url, headers=manager_headers).json()

    assert (as_cashier["average_cost"], as_cashier["last_cost"]) == (None, None)
    assert listed["average_cost"] is None
    assert Decimal(as_cashier["sale_price"]) == 1000
    assert Decimal(as_manager["average_cost"]) == 700


# --- Creation ------------------------------------------------------------------------


def test_create_product(
    client: TestClient, category: Category, manager_headers: dict[str, str]
) -> None:
    response = client.post(PRODUCTS_URL, json=product_payload(category), headers=manager_headers)

    assert response.status_code == 201
    body = response.json()
    assert body["sku"] == "BEB-001"
    assert body["type"] == "product"
    assert body["category"]["name"] == "Bebidas"
    assert (body["sale_price"], body["tax_rate"]) == ("2500.00", "19.00")
    assert (body["current_stock"], body["average_cost"]) == ("0.00", "0.00")
    assert body["stock_status"] == "out_of_stock"


def test_create_service_with_manual_cost(
    client: TestClient, category: Category, manager_headers: dict[str, str]
) -> None:
    payload = {
        "type": "service",
        "sku": "SRV-COPIA-BN",
        "name": "Fotocopia B/N",
        "category_id": category.id,
        "unit_of_measure": "page",
        "sale_price": "200",
        "cost": "60",
    }

    response = client.post(PRODUCTS_URL, json=payload, headers=manager_headers)

    assert response.status_code == 201
    body = response.json()
    assert (body["average_cost"], body["last_cost"]) == ("60.00", "60.00")
    assert body["stock_status"] is None


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"min_stock": "11"}, "INVALID_STOCK_LEVELS"),
        ({"target_stock": "9"}, "INVALID_STOCK_LEVELS"),
        ({"cost": "1500"}, "PRODUCT_COST_NOT_EDITABLE"),
        ({"type": "service"}, "SERVICE_STOCK_LEVELS"),
    ],
)
def test_create_product_business_validations(
    client: TestClient,
    category: Category,
    manager_headers: dict[str, str],
    overrides: dict[str, str],
    code: str,
) -> None:
    payload = product_payload(category, **overrides)

    response = client.post(PRODUCTS_URL, json=payload, headers=manager_headers)

    assert response.status_code == 422
    assert response.json()["code"] == code


@pytest.mark.parametrize(
    "overrides",
    [
        {"current_stock": "10"},
        {"average_cost": "100"},
        {"sale_price": "-1"},
        {"sale_price": "10.001"},
        {"tax_rate": "101"},
        {"sku": "con espacio"},
        {"unit_of_measure": "barril"},
    ],
)
def test_create_product_schema_validations(
    client: TestClient,
    category: Category,
    manager_headers: dict[str, str],
    overrides: dict[str, str],
) -> None:
    payload = product_payload(category, **overrides)

    response = client.post(PRODUCTS_URL, json=payload, headers=manager_headers)

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_create_product_requires_active_category(
    client: TestClient, db_session: Session, manager_headers: dict[str, str]
) -> None:
    inactive = add_category(db_session, "Descontinuados", is_active=False)

    response = client.post(PRODUCTS_URL, json=product_payload(inactive), headers=manager_headers)

    assert response.status_code == 422
    assert response.json()["code"] == "CATEGORY_INACTIVE"


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"barcode": "999"}, "SKU_TAKEN"),
        ({"sku": "OTRO-1"}, "BARCODE_TAKEN"),
    ],
)
def test_sku_and_barcode_are_unique(
    client: TestClient,
    category: Category,
    manager_headers: dict[str, str],
    overrides: dict[str, str],
    code: str,
) -> None:
    client.post(PRODUCTS_URL, json=product_payload(category), headers=manager_headers)

    response = client.post(
        PRODUCTS_URL, json=product_payload(category, **overrides), headers=manager_headers
    )

    assert response.status_code == 409
    assert response.json()["code"] == code


def test_products_without_barcode_do_not_conflict(
    client: TestClient, category: Category, manager_headers: dict[str, str]
) -> None:
    for sku in ("A-1", "A-2"):
        payload = product_payload(category, sku=sku, barcode="")
        response = client.post(PRODUCTS_URL, json=payload, headers=manager_headers)
        assert response.status_code == 201
        assert response.json()["barcode"] is None


# --- Updates -------------------------------------------------------------------------


def test_update_product_fields(
    client: TestClient, db_session: Session, category: Category, manager_headers: dict[str, str]
) -> None:
    product = add_product(db_session, category, "BEB-1", barcode="111")
    other_category = add_category(db_session, "Lácteos")

    response = client.patch(
        f"{PRODUCTS_URL}/{product.id}",
        json={"name": "Leche entera", "barcode": None, "category_id": other_category.id},
        headers=manager_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["barcode"]) == ("Leche entera", None)
    assert body["category"]["name"] == "Lácteos"


@pytest.mark.parametrize(
    "body", [{"type": "service"}, {"current_stock": "5"}, {"average_cost": "5"}, {"name": None}]
)
def test_update_rejects_protected_or_null_fields(
    client: TestClient,
    db_session: Session,
    category: Category,
    manager_headers: dict[str, str],
    body: dict[str, Any],
) -> None:
    product = add_product(db_session, category, "BEB-1")

    response = client.patch(f"{PRODUCTS_URL}/{product.id}", json=body, headers=manager_headers)

    assert response.status_code == 422


def test_update_validates_stock_levels_against_current_values(
    client: TestClient, db_session: Session, category: Category, manager_headers: dict[str, str]
) -> None:
    product = add_product(
        db_session,
        category,
        "BEB-1",
        min_stock=Decimal(5),
        reorder_point=Decimal(10),
        target_stock=Decimal(20),
    )
    url = f"{PRODUCTS_URL}/{product.id}"

    invalid = client.patch(url, json={"reorder_point": "25"}, headers=manager_headers)
    valid = client.patch(
        url, json={"reorder_point": "25", "target_stock": "30"}, headers=manager_headers
    )

    assert invalid.status_code == 422
    assert invalid.json()["code"] == "INVALID_STOCK_LEVELS"
    assert valid.status_code == 200


def test_update_rejects_cost_of_physical_product(
    client: TestClient, db_session: Session, category: Category, manager_headers: dict[str, str]
) -> None:
    product = add_product(db_session, category, "BEB-1")

    response = client.patch(
        f"{PRODUCTS_URL}/{product.id}", json={"cost": "800"}, headers=manager_headers
    )

    assert response.status_code == 422
    assert response.json()["code"] == "PRODUCT_COST_NOT_EDITABLE"


def test_update_cannot_move_product_to_inactive_category(
    client: TestClient, db_session: Session, category: Category, manager_headers: dict[str, str]
) -> None:
    product = add_product(db_session, category, "BEB-1")
    inactive = add_category(db_session, "Descontinuados", is_active=False)

    response = client.patch(
        f"{PRODUCTS_URL}/{product.id}", json={"category_id": inactive.id}, headers=manager_headers
    )

    assert response.status_code == 422
    assert response.json()["code"] == "CATEGORY_INACTIVE"


# --- Price history -------------------------------------------------------------------


def test_price_history_records_only_real_changes(
    client: TestClient, category: Category, manager_headers: dict[str, str]
) -> None:
    created = client.post(PRODUCTS_URL, json=product_payload(category), headers=manager_headers)
    url = f"{PRODUCTS_URL}/{created.json()['id']}"

    client.patch(url, json={"sale_price": "2500.00", "name": "Cola"}, headers=manager_headers)
    client.patch(url, json={"sale_price": "2800"}, headers=manager_headers)
    history = client.get(f"{url}/price-history", headers=manager_headers).json()

    assert history["total"] == 2
    latest, initial = history["items"]
    assert (latest["old_price"], latest["new_price"]) == ("2500.00", "2800.00")
    assert (initial["old_price"], initial["new_price"]) == (None, "2500.00")
    assert latest["changed_by"]["full_name"].startswith("Test inventory")


# --- Listing, search and stock status ------------------------------------------------


def test_search_by_name_sku_or_barcode(
    client: TestClient, db_session: Session, category: Category, manager_headers: dict[str, str]
) -> None:
    add_product(db_session, category, "BEB-001", name="Gaseosa cola", barcode="7701")
    add_product(db_session, category, "SNK-002", name="Papas fritas", barcode="7702")
    add_product(db_session, category, "ASE_003", name="Jabón")

    def search(term: str) -> list[str]:
        response = client.get(PRODUCTS_URL, params={"search": term}, headers=manager_headers)
        return [p["sku"] for p in response.json()["items"]]

    assert search("COLA") == ["BEB-001"]
    assert search("snk") == ["SNK-002"]
    assert search("7702") == ["SNK-002"]
    assert search("E_0") == ["ASE_003"]  # "_" is literal, not a wildcard


@pytest.mark.parametrize(
    ("stock", "expected"),
    [
        ("0", StockStatus.OUT_OF_STOCK),
        ("5", StockStatus.CRITICAL),
        ("5.5", StockStatus.LOW),
        ("10", StockStatus.LOW),
        ("10.01", StockStatus.OK),
    ],
)
def test_stock_status_boundaries(
    client: TestClient,
    db_session: Session,
    category: Category,
    manager_headers: dict[str, str],
    stock: str,
    expected: StockStatus,
) -> None:
    add_product(
        db_session,
        category,
        "BEB-1",
        current_stock=Decimal(stock),
        min_stock=Decimal(5),
        reorder_point=Decimal(10),
        target_stock=Decimal(20),
    )
    add_product(db_session, category, "SRV-1", type=ProductType.SERVICE)

    # The SQL filter and the value in the response must agree.
    filtered = client.get(
        PRODUCTS_URL, params={"stock_status": expected.value}, headers=manager_headers
    ).json()

    assert [p["sku"] for p in filtered["items"]] == ["BEB-1"]
    assert filtered["items"][0]["stock_status"] == expected.value


def test_list_products_filters(
    client: TestClient, db_session: Session, category: Category, manager_headers: dict[str, str]
) -> None:
    other = add_category(db_session, "Servicios")
    add_product(db_session, category, "BEB-1")
    add_product(db_session, category, "BEB-2", is_active=False)
    add_product(db_session, other, "SRV-1", type=ProductType.SERVICE)

    def skus(**params: Any) -> list[str]:
        response = client.get(PRODUCTS_URL, params=params, headers=manager_headers)
        return [p["sku"] for p in response.json()["items"]]

    assert skus(category_id=category.id) == ["BEB-1", "BEB-2"]
    assert skus(type="service") == ["SRV-1"]
    assert skus(is_active=False) == ["BEB-2"]


def test_missing_product_returns_404(client: TestClient, manager_headers: dict[str, str]) -> None:
    for url in (f"{PRODUCTS_URL}/999999", f"{PRODUCTS_URL}/999999/price-history"):
        response = client.get(url, headers=manager_headers)
        assert response.status_code == 404
        assert response.json()["code"] == "PRODUCT_NOT_FOUND"
