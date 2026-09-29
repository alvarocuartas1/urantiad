from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import (
    Category,
    DocumentSequence,
    InventoryMovement,
    MovementType,
    Product,
    Purchase,
    Supplier,
    SupplierProduct,
    User,
)
from app.services.inventory_service import reversed_average_cost
from tests.conftest import UserFactory
from tests.test_categories import add_category
from tests.test_products import add_product
from tests.test_suppliers import add_supplier, link

AuthHeaders = Callable[[User], dict[str, str]]

PURCHASES_URL = "/api/v1/purchases"


@pytest.fixture
def category(db_session: Session) -> Category:
    return add_category(db_session, "Bebidas")


@pytest.fixture
def keeper(make_user: UserFactory) -> User:
    return make_user(RoleCode.INVENTORY)


@pytest.fixture
def headers(keeper: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(keeper)


@pytest.fixture
def admin_headers(admin: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(admin)


@pytest.fixture
def supplier(db_session: Session) -> Supplier:
    return add_supplier(db_session, "Distribuidora Andina", "900123456-7")


@pytest.fixture
def product(db_session: Session, category: Category) -> Product:
    return add_product(
        db_session,
        category,
        "BEB-1",
        tax_rate=Decimal(19),
        current_stock=Decimal(10),
        average_cost=Decimal(1000),
        last_cost=Decimal(1000),
    )


def line(product: Product, **fields: Any) -> dict[str, Any]:
    return {"product_id": product.id, "quantity": "10", "unit_cost": "1500", **fields}


def create(
    client: TestClient,
    headers: dict[str, str],
    supplier: Supplier,
    items: list[dict[str, Any]],
    **fields: Any,
) -> Any:
    payload = {"supplier_id": supplier.id, "items": items, **fields}
    return client.post(PURCHASES_URL, json=payload, headers=headers)


def create_id(
    client: TestClient, headers: dict[str, str], supplier: Supplier, *items: dict[str, Any]
) -> int:
    response = create(client, headers, supplier, list(items))
    assert response.status_code == 201, response.json()
    return response.json()["id"]


def confirm(client: TestClient, headers: dict[str, str], purchase_id: int) -> Any:
    return client.post(f"{PURCHASES_URL}/{purchase_id}/confirm", headers=headers)


def cancel(client: TestClient, headers: dict[str, str], purchase_id: int) -> Any:
    return client.post(
        f"{PURCHASES_URL}/{purchase_id}/cancel",
        json={"reason": "Costos mal digitados"},
        headers=headers,
    )


def buy(
    client: TestClient, headers: dict[str, str], supplier: Supplier, *items: dict[str, Any]
) -> Any:
    """Create and confirm a purchase; returns the confirmed purchase body."""
    response = confirm(client, headers, create_id(client, headers, supplier, *items))
    assert response.status_code == 200, response.json()
    return response.json()


def purchase_number(db: Session, offset: int) -> str:
    """Number the sequence will give `offset` confirmations from now (1 = the next one)."""
    last_value = db.scalars(
        select(DocumentSequence.last_value).where(DocumentSequence.name == "purchase")
    ).one()
    return f"COMPRA-{last_value + offset:06d}"


def movements(db: Session, product: Product) -> list[InventoryMovement]:
    stmt = (
        select(InventoryMovement)
        .where(InventoryMovement.product_id == product.id)
        .order_by(InventoryMovement.id)
    )
    return list(db.scalars(stmt))


# --- Permissions ---------------------------------------------------------------------


def test_cashier_has_no_access_to_purchases(
    client: TestClient,
    supplier: Supplier,
    product: Product,
    cashier: User,
    auth_headers: AuthHeaders,
) -> None:
    headers = auth_headers(cashier)

    assert client.get(PURCHASES_URL, headers=headers).status_code == 403
    assert create(client, headers, supplier, [line(product)]).status_code == 403
    cost_history = client.get(f"/api/v1/products/{product.id}/cost-history", headers=headers)
    assert cost_history.status_code == 403


def test_only_admin_can_cancel(
    client: TestClient,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
    admin_headers: dict[str, str],
) -> None:
    purchase_id = buy(client, headers, supplier, line(product))["id"]

    assert cancel(client, headers, purchase_id).status_code == 403
    assert cancel(client, admin_headers, purchase_id).status_code == 200


# --- Drafts --------------------------------------------------------------------------


def test_create_draft_computes_totals_without_moving_inventory(
    client: TestClient,
    db_session: Session,
    category: Category,
    supplier: Supplier,
    product: Product,
    keeper: User,
    headers: dict[str, str],
) -> None:
    other = add_product(db_session, category, "BEB-2", tax_rate=Decimal(5))
    items = [
        line(product, discount="1000"),
        line(other, quantity="3", unit_cost="333.33", tax_rate="0"),
    ]

    response = create(
        client,
        headers,
        supplier,
        items,
        supplier_invoice_number=" FE-100 ",
        amount_paid="5000",
        notes="Pedido semanal",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["number"] is None
    assert body["supplier"]["id"] == supplier.id
    assert body["supplier_invoice_number"] == "FE-100"
    assert body["created_by"]["id"] == keeper.id
    first, second = body["items"]
    # 10 x 1500 = 15000 - 1000 discount = 14000; IVA 19 % (the product's rate) = 2660.
    assert first["tax_rate"] == "19.00"
    assert (first["subtotal"], first["tax_amount"], first["total"]) == (
        "14000.00",
        "2660.00",
        "16660.00",
    )
    assert first["net_unit_cost"] == "1400.00"
    # 3 x 333.33 = 999.99 with the line's explicit 0 % rate.
    assert (second["subtotal"], second["tax_amount"]) == ("999.99", "0.00")
    assert body["subtotal"] == "15999.99"
    assert body["discount_total"] == "1000.00"
    assert body["tax_total"] == "2660.00"
    assert body["total"] == "17659.99"
    assert body["amount_paid"] == "5000.00"
    assert body["balance_due"] == "12659.99"
    db_session.refresh(product)
    assert product.current_stock == Decimal(10)
    assert movements(db_session, product) == []


def test_line_rounding_and_net_cost(
    client: TestClient,
    db_session: Session,
    category: Category,
    supplier: Supplier,
    headers: dict[str, str],
) -> None:
    bulk = add_product(db_session, category, "GRA-1", unit_of_measure="kg")

    body = create(
        client, headers, supplier, [line(bulk, quantity="1.5", unit_cost="333.33", discount="0.5")]
    ).json()

    # 1.5 x 333.33 = 499.995 -> 500.00 (half up) - 0.50 = 499.50; net 499.50 / 1.5 = 333.00.
    assert body["items"][0]["subtotal"] == "499.50"
    assert body["items"][0]["net_unit_cost"] == "333.00"


@pytest.mark.parametrize(
    "fields",
    [
        {"items": [{"product_id": 1, "quantity": "0", "unit_cost": "1"}]},
        {"items": [{"product_id": 1, "quantity": "1", "unit_cost": "-1"}]},
        {"items": [{"product_id": 1, "quantity": "2", "unit_cost": "10", "discount": "20.01"}]},
        {"items": [{"product_id": 1, "quantity": "1", "unit_cost": "1", "tax_rate": "101"}]},
        {"items": [{"product_id": 1, "quantity": "1", "unit_cost": "1", "extra": True}]},
        {"amount_paid": "-1"},
        {"status": "confirmed"},
    ],
)
def test_invalid_purchase_bodies_are_rejected(
    client: TestClient, supplier: Supplier, headers: dict[str, str], fields: dict[str, Any]
) -> None:
    response = client.post(
        PURCHASES_URL, json={"supplier_id": supplier.id, **fields}, headers=headers
    )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_product_can_appear_once(
    client: TestClient, supplier: Supplier, product: Product, headers: dict[str, str]
) -> None:
    response = create(client, headers, supplier, [line(product), line(product, quantity="2")])

    assert response.status_code == 422
    assert "una sola vez" in response.json()["detail"]


def test_only_active_physical_products_can_be_bought(
    client: TestClient,
    db_session: Session,
    category: Category,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    service = add_product(db_session, category, "SRV-1", type="service", unit_of_measure="page")
    inactive = add_product(db_session, category, "BEB-OFF", is_active=False)

    cases = [
        (service, "PRODUCT_NOT_PURCHASABLE"),
        (inactive, "PRODUCT_INACTIVE"),
    ]
    for bad_product, code in cases:
        response = create(client, headers, supplier, [line(product), line(bad_product)])
        assert response.status_code == 422
        assert response.json()["code"] == code
        assert response.json()["detail"].startswith("Línea 2:")

    missing = create(client, headers, supplier, [{**line(product), "product_id": 999999}])
    assert missing.json()["code"] == "PRODUCT_NOT_FOUND"


def test_countable_units_require_whole_quantities(
    client: TestClient, supplier: Supplier, product: Product, headers: dict[str, str]
) -> None:
    response = create(client, headers, supplier, [line(product, quantity="1.5")])

    assert response.status_code == 422
    assert response.json()["code"] == "FRACTIONAL_QUANTITY"


def test_supplier_must_exist_and_be_active(
    client: TestClient, db_session: Session, product: Product, headers: dict[str, str]
) -> None:
    inactive = add_supplier(db_session, "Cerrado", "800000000-1", is_active=False)

    response = create(client, headers, inactive, [line(product)])
    assert response.status_code == 422
    assert response.json()["code"] == "SUPPLIER_INACTIVE"

    missing = client.post(PURCHASES_URL, json={"supplier_id": 999999}, headers=headers)
    assert missing.status_code == 422
    assert missing.json()["code"] == "SUPPLIER_NOT_FOUND"


def test_amount_paid_cannot_exceed_total(
    client: TestClient, supplier: Supplier, product: Product, headers: dict[str, str]
) -> None:
    # Total: 10 x 1500 + 19 % = 17850.
    response = create(client, headers, supplier, [line(product)], amount_paid="17850.01")

    assert response.status_code == 422
    assert response.json()["code"] == "AMOUNT_PAID_EXCEEDS_TOTAL"
    assert create(client, headers, supplier, [line(product)], amount_paid="17850").status_code == (
        201
    )


def test_update_draft_replaces_header_and_items(
    client: TestClient,
    db_session: Session,
    category: Category,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    second = add_product(db_session, category, "BEB-2")
    third = add_product(db_session, category, "BEB-3")
    other_supplier = add_supplier(db_session, "Lácteos del Valle", "900555444-1")
    purchase_id = create_id(client, headers, supplier, line(product), line(second))

    response = client.put(
        f"{PURCHASES_URL}/{purchase_id}",
        json={
            "supplier_id": other_supplier.id,
            "items": [line(third, quantity="1", unit_cost="100"), line(product, quantity="4")],
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["supplier"]["id"] == other_supplier.id
    assert {(item["product"]["sku"], item["quantity"]) for item in body["items"]} == {
        ("BEB-1", "4.00"),
        ("BEB-3", "1.00"),
    }
    # 4 x 1500 + 19 % = 7140; 1 x 100 at the product's 0 % rate.
    assert body["total"] == "7240.00"


def test_failed_update_leaves_draft_unchanged(
    client: TestClient,
    db_session: Session,
    category: Category,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    service = add_product(db_session, category, "SRV-1", type="service", unit_of_measure="page")
    purchase_id = create_id(client, headers, supplier, line(product))

    response = client.put(
        f"{PURCHASES_URL}/{purchase_id}",
        json={"supplier_id": supplier.id, "items": [line(product, quantity="2"), line(service)]},
        headers=headers,
    )

    assert response.status_code == 422
    body = client.get(f"{PURCHASES_URL}/{purchase_id}", headers=headers).json()
    assert [item["quantity"] for item in body["items"]] == ["10.00"]


def test_discard_draft(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    purchase_id = create_id(client, headers, supplier, line(product))

    assert client.delete(f"{PURCHASES_URL}/{purchase_id}", headers=headers).status_code == 204
    assert client.get(f"{PURCHASES_URL}/{purchase_id}", headers=headers).status_code == 404
    assert db_session.get(Purchase, purchase_id) is None


def test_confirmed_purchase_cannot_be_edited_or_discarded(
    client: TestClient, supplier: Supplier, product: Product, headers: dict[str, str]
) -> None:
    purchase_id = buy(client, headers, supplier, line(product))["id"]
    url = f"{PURCHASES_URL}/{purchase_id}"

    update = client.put(url, json={"supplier_id": supplier.id}, headers=headers)
    delete = client.delete(url, headers=headers)

    for response in (update, delete, confirm(client, headers, purchase_id)):
        assert response.status_code == 409
        assert response.json()["code"] == "PURCHASE_NOT_DRAFT"


def test_missing_purchase_returns_404(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get(f"{PURCHASES_URL}/999999", headers=headers)

    assert response.status_code == 404
    assert response.json()["code"] == "PURCHASE_NOT_FOUND"


# --- Confirmation --------------------------------------------------------------------


def test_confirm_enters_inventory_at_net_cost(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    keeper: User,
    headers: dict[str, str],
) -> None:
    expected_number = purchase_number(db_session, 1)
    purchase_id = create_id(client, headers, supplier, line(product, discount="1000"))

    response = confirm(client, headers, purchase_id)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "confirmed"
    assert body["number"] == expected_number
    assert body["confirmed_by"]["id"] == keeper.id
    assert body["confirmed_at"] is not None
    db_session.refresh(product)
    # Net cost 1400: (10 x 1000 + 10 x 1400) / 20 = 1200.
    assert product.current_stock == Decimal(20)
    assert product.average_cost == Decimal(1200)
    assert product.last_cost == Decimal(1400)
    [movement] = movements(db_session, product)
    assert movement.movement_type == MovementType.PURCHASE_ENTRY
    assert (movement.stock_before, movement.stock_after) == (Decimal(10), Decimal(20))
    assert movement.unit_cost == Decimal(1400)
    assert movement.purchase_id == purchase_id

    listed = client.get(
        "/api/v1/inventory/movements", params={"product_id": product.id}, headers=headers
    ).json()
    assert listed["items"][0]["purchase"] == {"id": purchase_id, "number": expected_number}


def test_confirm_links_product_to_supplier_with_net_price(
    client: TestClient,
    db_session: Session,
    category: Category,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    linked = add_product(db_session, category, "BEB-2")
    same_price = add_product(db_session, category, "BEB-3")
    link(db_session, supplier, linked, supplier_sku="AND-9", purchase_price=Decimal(900))
    old_date = datetime(2026, 1, 1, tzinfo=UTC)
    link(db_session, supplier, same_price, purchase_price=Decimal(500), price_updated_at=old_date)

    buy(
        client,
        headers,
        supplier,
        line(product, discount="1000"),
        line(linked, quantity="2", unit_cost="950"),
        line(same_price, quantity="1", unit_cost="500"),
    )

    links = {
        sp.product_id: sp
        for sp in db_session.scalars(
            select(SupplierProduct).where(SupplierProduct.supplier_id == supplier.id)
        )
    }
    for sp in links.values():
        db_session.refresh(sp)
    assert links[product.id].purchase_price == Decimal(1400)
    assert links[product.id].price_updated_at is not None
    assert links[linked.id].purchase_price == Decimal(950)
    assert links[linked.id].supplier_sku == "AND-9"
    assert links[same_price.id].price_updated_at == old_date


def test_numbers_are_consecutive_in_confirmation_order(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    first_draft = create_id(client, headers, supplier, line(product))
    discarded = create_id(client, headers, supplier, line(product))
    second_draft = create_id(client, headers, supplier, line(product))
    client.delete(f"{PURCHASES_URL}/{discarded}", headers=headers)
    expected = [purchase_number(db_session, 1), purchase_number(db_session, 2)]

    numbers = [
        confirm(client, headers, second_draft).json()["number"],
        confirm(client, headers, first_draft).json()["number"],
    ]

    assert numbers == expected


def test_empty_purchase_cannot_be_confirmed(
    client: TestClient, supplier: Supplier, headers: dict[str, str]
) -> None:
    purchase_id = create(client, headers, supplier, []).json()["id"]

    response = confirm(client, headers, purchase_id)

    assert response.status_code == 422
    assert response.json()["code"] == "EMPTY_PURCHASE"


def test_failed_confirmation_changes_nothing(
    client: TestClient,
    db_session: Session,
    category: Category,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    # Product ids are ascending, so the valid line is applied before the failing one.
    later = add_product(db_session, category, "BEB-2")
    purchase_id = create_id(client, headers, supplier, line(product), line(later))
    later.is_active = False
    db_session.commit()  # outside the savepoint the failed request rolls back
    sequence_before = purchase_number(db_session, 1)

    response = confirm(client, headers, purchase_id)

    assert response.status_code == 422
    assert response.json()["code"] == "PRODUCT_INACTIVE"
    assert response.json()["detail"].startswith("Línea 2:")
    db_session.expire_all()
    assert db_session.get_one(Purchase, purchase_id).status == "draft"
    assert db_session.get_one(Product, product.id).current_stock == Decimal(10)
    assert movements(db_session, product) == []
    assert purchase_number(db_session, 1) == sequence_before


def test_supplier_invoice_is_registered_once(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
    admin_headers: dict[str, str],
) -> None:
    other_supplier = add_supplier(db_session, "Lácteos del Valle", "900555444-1")
    first = create(client, headers, supplier, [line(product)], supplier_invoice_number="FE-1")

    duplicate = create(client, headers, supplier, [], supplier_invoice_number="fe-1")
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "DUPLICATE_SUPPLIER_INVOICE"
    other = create(client, headers, other_supplier, [], supplier_invoice_number="FE-1")
    assert other.status_code == 201

    purchase_id = first.json()["id"]
    confirm(client, headers, purchase_id)
    cancel(client, admin_headers, purchase_id)
    after_cancel = create(client, headers, supplier, [], supplier_invoice_number="FE-1")
    assert after_cancel.status_code == 201


# --- Cancellation --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("stock", "average", "quantity", "unit_cost", "expected"),
    [
        # Inverse of the entry in test_confirm_enters_inventory_at_net_cost.
        ("20", "1200", "10", "1400", "1000.00"),
        ("3", "1000", "1", "1001", "999.50"),
        # Nothing left: the average is kept.
        ("10", "1200", "10", "1400", "1200"),
        # Units sold in between at a lower average: the value removed exceeds the stock value.
        ("5", "1000", "4", "2000", "1000"),
    ],
)
def test_reversed_average_cost(
    stock: str, average: str, quantity: str, unit_cost: str, expected: str
) -> None:
    result = reversed_average_cost(
        Decimal(stock), Decimal(average), Decimal(quantity), Decimal(unit_cost)
    )
    assert result == Decimal(expected)


def test_cancel_reverses_stock_and_costs(
    client: TestClient,
    db_session: Session,
    admin: User,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
    admin_headers: dict[str, str],
) -> None:
    buy(client, headers, supplier, line(product, discount="1000"))  # 10 at 1400 -> avg 1200
    mistaken = buy(client, headers, supplier, line(product, unit_cost="3000"))["id"]
    db_session.refresh(product)
    assert product.average_cost == Decimal(1800)  # (20 x 1200 + 10 x 3000) / 30

    response = cancel(client, admin_headers, mistaken)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["cancelled_by"]["id"] == admin.id
    assert body["cancellation_reason"] == "Costos mal digitados"
    db_session.refresh(product)
    assert product.current_stock == Decimal(20)
    assert product.average_cost == Decimal(1200)
    assert product.last_cost == Decimal(1400)
    reversal = movements(db_session, product)[-1]
    assert reversal.movement_type == MovementType.PURCHASE_CANCELLATION
    assert (reversal.stock_before, reversal.stock_after) == (Decimal(30), Decimal(20))
    assert reversal.unit_cost == Decimal(3000)
    assert reversal.reason == "Costos mal digitados"
    assert reversal.purchase_id == mistaken


def test_cancel_fails_without_changes_when_units_were_sold(
    client: TestClient,
    db_session: Session,
    category: Category,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
    admin_headers: dict[str, str],
) -> None:
    empty = add_product(db_session, category, "BEB-2")
    purchase_id = buy(client, headers, supplier, line(product), line(empty, quantity="3"))["id"]
    client.post(
        "/api/v1/inventory/adjustments",
        json={"product_id": empty.id, "direction": "out", "quantity": "1", "reason": "Merma"},
        headers=headers,
    )

    response = cancel(client, admin_headers, purchase_id)

    assert response.status_code == 409
    assert response.json()["code"] == "INSUFFICIENT_STOCK"
    assert response.json()["detail"].startswith("Línea 2:")
    db_session.expire_all()
    assert db_session.get_one(Purchase, purchase_id).status == "confirmed"
    assert db_session.get_one(Product, product.id).current_stock == Decimal(20)
    count = select(func.count()).where(
        InventoryMovement.movement_type == MovementType.PURCHASE_CANCELLATION
    )
    assert db_session.scalar(count) == 0


def test_only_confirmed_purchases_can_be_cancelled(
    client: TestClient,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
    admin_headers: dict[str, str],
) -> None:
    draft = create_id(client, headers, supplier, line(product))
    confirmed = buy(client, headers, supplier, line(product))["id"]
    cancel(client, admin_headers, confirmed)

    for purchase_id in (draft, confirmed):
        response = cancel(client, admin_headers, purchase_id)
        assert response.status_code == 409
        assert response.json()["code"] == "PURCHASE_NOT_CONFIRMED"


# --- Listing and cost history --------------------------------------------------------


def test_list_purchases_with_filters(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
) -> None:
    other_supplier = add_supplier(db_session, "Lácteos del Valle", "900555444-1")
    confirmed = buy(client, headers, supplier, line(product))
    draft = create(
        client, headers, other_supplier, [line(product)], supplier_invoice_number="LV-77"
    ).json()

    def ids(**params: Any) -> list[int]:
        body = client.get(PURCHASES_URL, params=params, headers=headers).json()
        return [item["id"] for item in body["items"]]

    assert ids() == [draft["id"], confirmed["id"]]
    assert ids(status="confirmed") == [confirmed["id"]]
    assert ids(supplier_id=other_supplier.id) == [draft["id"]]
    assert ids(search=confirmed["number"]) == [confirmed["id"]]
    assert ids(search="lv-77") == [draft["id"]]
    assert ids(search="andina") == [confirmed["id"]]
    listed = client.get(PURCHASES_URL, headers=headers).json()["items"][0]
    assert "items" not in listed


def test_cost_history_with_variation_and_margin(
    client: TestClient,
    db_session: Session,
    supplier: Supplier,
    product: Product,
    headers: dict[str, str],
    admin_headers: dict[str, str],
) -> None:
    other_supplier = add_supplier(db_session, "Lácteos del Valle", "900555444-1")
    first = buy(client, headers, supplier, line(product, unit_cost="800"))
    cancelled = buy(client, headers, supplier, line(product, unit_cost="5000"))
    cancel(client, admin_headers, cancelled["id"])
    last = buy(client, headers, other_supplier, line(product, unit_cost="1000"))

    response = client.get(f"/api/v1/products/{product.id}/cost-history", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    newest, oldest = body["items"]
    assert newest["purchase_number"] == last["number"]
    assert newest["supplier"] == {"id": other_supplier.id, "name": "Lácteos del Valle"}
    assert newest["unit_cost"] == "1000.00"
    assert newest["previous_unit_cost"] == "800.00"
    assert newest["variation_percent"] == "25.00"
    assert oldest["purchase_number"] == first["number"]
    assert oldest["previous_unit_cost"] is None
    assert oldest["variation_percent"] is None
    summary = body["summary"]
    db_session.refresh(product)
    assert summary["average_cost"] == f"{product.average_cost:.2f}"
    # 1000 with 19 % IVA included -> 840.34 before tax.
    assert summary["sale_price_before_tax"] == "840.34"
    margin = Decimal("840.34") - product.average_cost
    assert summary["gross_margin"] == f"{margin:.2f}"
