from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import Category, Product, ProductType, Supplier, SupplierProduct, User
from tests.conftest import UserFactory
from tests.test_categories import add_category
from tests.test_products import add_product

AuthHeaders = Callable[[User], dict[str, str]]

SUPPLIERS_URL = "/api/v1/suppliers"


@pytest.fixture
def headers(make_user: UserFactory, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(make_user(RoleCode.INVENTORY))


@pytest.fixture
def category(db_session: Session) -> Category:
    return add_category(db_session, "Papelería")


@pytest.fixture
def supplier(db_session: Session) -> Supplier:
    return add_supplier(db_session, "Distribuidora Andina", "900123456-7")


@pytest.fixture
def product(db_session: Session, category: Category) -> Product:
    return add_product(db_session, category, "CUA-001", name="Cuaderno 100 hojas")


def add_supplier(db: Session, name: str, document: str, **fields: Any) -> Supplier:
    supplier = Supplier(name=name, document_type="nit", document_number=document, **fields)
    db.add(supplier)
    db.flush()
    return supplier


def link(db: Session, supplier: Supplier, product: Product, **fields: Any) -> SupplierProduct:
    supplier_product = SupplierProduct(supplier=supplier, product=product, **fields)
    db.add(supplier_product)
    db.flush()
    return supplier_product


def products_url(supplier: Supplier, product: Product | None = None) -> str:
    url = f"{SUPPLIERS_URL}/{supplier.id}/products"
    return f"{url}/{product.id}" if product else url


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("get", SUPPLIERS_URL),
        ("post", SUPPLIERS_URL),
        ("patch", f"{SUPPLIERS_URL}/1"),
        ("get", f"{SUPPLIERS_URL}/1/products"),
        ("post", f"{SUPPLIERS_URL}/1/products"),
        ("delete", f"{SUPPLIERS_URL}/1/products/1"),
        ("get", "/api/v1/products/1/suppliers"),
    ],
)
def test_cashier_has_no_access_to_suppliers(
    client: TestClient, cashier: User, auth_headers: AuthHeaders, method: str, url: str
) -> None:
    response = client.request(method, url, headers=auth_headers(cashier), json={})

    assert response.status_code == 403


def test_suppliers_require_authentication(client: TestClient) -> None:
    assert client.get(SUPPLIERS_URL).status_code == 401


# --- Suppliers -----------------------------------------------------------------------


def test_create_supplier_normalizes_fields(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        SUPPLIERS_URL,
        json={
            "document_number": " 900.123.456-7 ",
            "name": "  Distribuidora Andina ",
            "email": "  Ventas@Andina.CO ",
            "phone": "+57 (601) 555-1234",
            "contact_name": "   ",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["document_type"] == "nit"
    assert body["document_number"] == "900123456-7"
    assert body["name"] == "Distribuidora Andina"
    assert body["email"] == "ventas@andina.co"
    assert body["contact_name"] is None
    assert body["is_active"] is True


@pytest.mark.parametrize(
    "overrides",
    [
        {"email": "no-es-correo"},
        {"phone": "300-ABC"},
        {"document_number": "90012#3456"},
        {"document_type": "rut"},
        {"name": " "},
        {"unknown": "x"},
    ],
)
def test_create_supplier_schema_validations(
    client: TestClient, headers: dict[str, str], overrides: dict[str, Any]
) -> None:
    payload = {"document_number": "900123456", "name": "Proveedor", **overrides}

    response = client.post(SUPPLIERS_URL, json=payload, headers=headers)

    assert response.status_code == 422


# A conflict rolls back the test session (fixtures included), so one request per test.
@pytest.mark.parametrize("renaming", [False, True])
def test_document_is_unique_per_type(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    headers: dict[str, str],
    renaming: bool,
) -> None:
    if renaming:
        other = add_supplier(db_session, "Otro", "800000000-1")
        url = f"{SUPPLIERS_URL}/{other.id}"
        response = client.patch(url, json={"document_number": "900.123.456-7"}, headers=headers)
    else:
        payload = {"document_number": "900123456-7", "name": "Copia"}
        response = client.post(SUPPLIERS_URL, json=payload, headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "SUPPLIER_DOCUMENT_TAKEN"


def test_same_number_with_other_document_type_is_allowed(
    client: TestClient, supplier: Supplier, headers: dict[str, str]
) -> None:
    payload = {"document_type": "cc", "document_number": "900123456-7", "name": "Persona"}

    assert client.post(SUPPLIERS_URL, json=payload, headers=headers).status_code == 201


def test_update_and_deactivate_supplier(
    client: TestClient, supplier: Supplier, headers: dict[str, str]
) -> None:
    url = f"{SUPPLIERS_URL}/{supplier.id}"

    updated = client.patch(
        url, json={"city": "Medellín", "notes": "Entrega los lunes"}, headers=headers
    )
    assert updated.status_code == 200
    assert (updated.json()["city"], updated.json()["notes"]) == ("Medellín", "Entrega los lunes")

    changed = client.patch(url, json={"city": None, "is_active": False}, headers=headers).json()
    assert changed["city"] is None
    assert changed["is_active"] is False
    assert changed["name"] == "Distribuidora Andina"


@pytest.mark.parametrize("field", ["name", "document_number", "is_active"])
def test_update_rejects_null_for_required_fields(
    client: TestClient, supplier: Supplier, headers: dict[str, str], field: str
) -> None:
    response = client.patch(f"{SUPPLIERS_URL}/{supplier.id}", json={field: None}, headers=headers)

    assert response.status_code == 422


def test_list_suppliers_search_and_filter(
    client: TestClient, db_session: Session, headers: dict[str, str]
) -> None:
    add_supplier(db_session, "Papelería Central", "800111222-3", contact_name="Luis")
    add_supplier(db_session, "Distribuidora Norte", "900555666-1", is_active=False)
    add_supplier(db_session, "Aseo Total", "700999888-0", contact_name="Marta Papel")

    def names(**params: Any) -> list[str]:
        response = client.get(SUPPLIERS_URL, params=params, headers=headers)
        return [s["name"] for s in response.json()["items"]]

    assert names(search="papel") == ["Aseo Total", "Papelería Central"]
    assert names(search="900555") == ["Distribuidora Norte"]
    assert names(is_active=False) == ["Distribuidora Norte"]
    assert client.get(SUPPLIERS_URL, params={"size": 2}, headers=headers).json()["total"] == 3


def test_missing_supplier_returns_404(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get(f"{SUPPLIERS_URL}/999999", headers=headers)

    assert response.status_code == 404
    assert response.json()["code"] == "SUPPLIER_NOT_FOUND"


# --- Products by supplier ------------------------------------------------------------


def test_add_product_to_supplier(
    client: TestClient, supplier: Supplier, product: Product, headers: dict[str, str]
) -> None:
    payload = {
        "product_id": product.id,
        "supplier_sku": " AND-44 ",
        "purchase_price": "1800.50",
        "notes": "Caja x 12",
    }

    response = client.post(products_url(supplier), json=payload, headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["supplier"]["id"] == supplier.id
    assert body["product"] == {
        "id": product.id,
        "sku": "CUA-001",
        "name": "Cuaderno 100 hojas",
        "unit_of_measure": "unit",
        "is_active": True,
    }
    assert (body["supplier_sku"], body["purchase_price"]) == ("AND-44", "1800.50")
    assert body["price_updated_at"] is not None


def test_link_without_price_has_no_price_date(
    client: TestClient, supplier: Supplier, product: Product, headers: dict[str, str]
) -> None:
    payload = {"product_id": product.id}

    body = client.post(products_url(supplier), json=payload, headers=headers).json()

    assert (body["purchase_price"], body["price_updated_at"]) == (None, None)


def test_product_is_linked_once_per_supplier(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    link(db_session, supplier, product)

    response = client.post(products_url(supplier), json={"product_id": product.id}, headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "SUPPLIER_PRODUCT_EXISTS"


@pytest.mark.parametrize(
    ("product_fields", "code"),
    [
        ({"type": ProductType.SERVICE.value}, "PRODUCT_NOT_PURCHASABLE"),
        ({"is_active": False}, "PRODUCT_INACTIVE"),
        (None, "PRODUCT_NOT_FOUND"),
    ],
)
def test_only_active_physical_products_can_be_linked(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    category: Category,
    headers: dict[str, str],
    product_fields: dict[str, Any] | None,
    code: str,
) -> None:
    product_id = (
        add_product(db_session, category, "X-1", **product_fields).id if product_fields else 999999
    )

    response = client.post(products_url(supplier), json={"product_id": product_id}, headers=headers)

    assert response.status_code == 422
    assert response.json()["code"] == code


def test_inactive_supplier_cannot_receive_products(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    supplier.is_active = False
    db_session.flush()

    response = client.post(products_url(supplier), json={"product_id": product.id}, headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "SUPPLIER_INACTIVE"


def test_price_date_changes_only_with_the_price(
    client: TestClient, supplier: Supplier, product: Product, headers: dict[str, str]
) -> None:
    created = client.post(
        products_url(supplier),
        json={"product_id": product.id, "purchase_price": "1000"},
        headers=headers,
    ).json()
    url = products_url(supplier, product)

    notes = client.patch(url, json={"notes": "Nuevo empaque"}, headers=headers).json()
    same_price = client.patch(url, json={"purchase_price": "1000.00"}, headers=headers).json()
    new_price = client.patch(url, json={"purchase_price": "1100"}, headers=headers).json()
    cleared = client.patch(url, json={"purchase_price": None}, headers=headers).json()

    assert notes["notes"] == "Nuevo empaque"
    assert notes["price_updated_at"] == created["price_updated_at"]
    assert same_price["price_updated_at"] == created["price_updated_at"]
    assert new_price["purchase_price"] == "1100.00"
    assert new_price["price_updated_at"] > created["price_updated_at"]
    assert (cleared["purchase_price"], cleared["price_updated_at"]) == (None, None)


def test_update_link_rejects_unknown_fields(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    link(db_session, supplier, product)

    response = client.patch(
        products_url(supplier, product), json={"product_id": 5}, headers=headers
    )

    assert response.status_code == 422


def test_remove_product_from_supplier(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    link(db_session, supplier, product)
    url = products_url(supplier, product)

    assert client.delete(url, headers=headers).status_code == 204
    missing = client.delete(url, headers=headers)
    assert missing.status_code == 404
    assert missing.json()["code"] == "SUPPLIER_PRODUCT_NOT_FOUND"


def test_link_of_missing_supplier_reports_supplier_not_found(
    client: TestClient, product: Product, headers: dict[str, str]
) -> None:
    response = client.patch(
        f"{SUPPLIERS_URL}/999999/products/{product.id}", json={}, headers=headers
    )

    assert response.status_code == 404
    assert response.json()["code"] == "SUPPLIER_NOT_FOUND"


def test_list_supplier_products_with_search(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    category: Category,
    headers: dict[str, str],
) -> None:
    other_supplier = add_supplier(db_session, "Otro", "800000000-1")
    pencil = add_product(db_session, category, "LAP-001", name="Lápiz HB")
    notebook = add_product(db_session, category, "CUA-001", name="Cuaderno")
    link(db_session, supplier, pencil, supplier_sku="AND-77")
    link(db_session, supplier, notebook)
    link(db_session, other_supplier, add_product(db_session, category, "BOR-1", name="Borrador"))

    def names(**params: Any) -> list[str]:
        response = client.get(products_url(supplier), params=params, headers=headers)
        return [item["product"]["name"] for item in response.json()["items"]]

    assert names() == ["Cuaderno", "Lápiz HB"]
    assert names(search="and-77") == ["Lápiz HB"]
    assert names(search="cua") == ["Cuaderno"]


def test_product_suppliers_most_recent_price_first(
    client: TestClient,
    db_session: Session,
    product: Product,
    headers: dict[str, str],
) -> None:
    unpriced = add_supplier(db_session, "A sin precio", "100")
    older = add_supplier(db_session, "B antiguo", "200")
    newer = add_supplier(db_session, "C reciente", "300")
    link(db_session, unpriced, product)
    for supplier, price in ((older, "1000"), (newer, "950")):
        client.post(
            products_url(supplier),
            json={"product_id": product.id, "purchase_price": price},
            headers=headers,
        )

    response = client.get(f"/api/v1/products/{product.id}/suppliers", headers=headers)

    assert response.status_code == 200
    items = response.json()
    assert [i["supplier"]["name"] for i in items] == ["C reciente", "B antiguo", "A sin precio"]
    assert Decimal(items[0]["purchase_price"]) == Decimal(950)


def test_product_suppliers_of_missing_product_returns_404(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.get("/api/v1/products/999999/suppliers", headers=headers)

    assert response.status_code == 404
