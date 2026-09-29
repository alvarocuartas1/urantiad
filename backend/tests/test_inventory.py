from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.permissions import RoleCode
from app.models import Category, InventoryMovement, MovementType, Product, User
from app.schemas.inventory import MovementResponse
from app.services.inventory_service import weighted_average_cost
from tests.conftest import UserFactory
from tests.test_categories import add_category
from tests.test_products import add_product

AuthHeaders = Callable[[User], dict[str, str]]

ADJUSTMENTS_URL = "/api/v1/inventory/adjustments"
MOVEMENTS_URL = "/api/v1/inventory/movements"
REPLENISHMENT_URL = "/api/v1/inventory/replenishment"


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
def product(db_session: Session, category: Category) -> Product:
    return add_product(
        db_session,
        category,
        "BEB-1",
        current_stock=Decimal(10),
        average_cost=Decimal(1000),
        last_cost=Decimal(1000),
        min_stock=Decimal(2),
        reorder_point=Decimal(5),
        target_stock=Decimal(20),
    )


def adjust(client: TestClient, headers: dict[str, str], product: Product, **fields: Any) -> Any:
    payload = {"product_id": product.id, "direction": "in", "quantity": "1", "reason": "Conteo"}
    return client.post(ADJUSTMENTS_URL, json={**payload, **fields}, headers=headers)


def movement_count(db: Session, product: Product) -> int:
    stmt = select(func.count()).where(InventoryMovement.product_id == product.id)
    return db.scalar(stmt) or 0


# --- Permissions ---------------------------------------------------------------------


def test_cashier_cannot_read_or_adjust_inventory(
    client: TestClient, product: Product, cashier: User, auth_headers: AuthHeaders
) -> None:
    headers = auth_headers(cashier)

    assert adjust(client, headers, product).status_code == 403
    assert client.get(MOVEMENTS_URL, headers=headers).status_code == 403
    assert client.get(REPLENISHMENT_URL, headers=headers).status_code == 403


def test_movement_costs_are_hidden_without_view_costs_permission(
    client: TestClient,
    db_session: Session,
    product: Product,
    headers: dict[str, str],
    cashier: User,
) -> None:
    adjust(client, headers, product, quantity="2")
    movement = db_session.scalars(select(InventoryMovement)).one()

    hidden = MovementResponse.for_user(movement, cashier)

    assert hidden.unit_cost is None
    assert hidden.average_cost_after is None


# --- Weighted average cost -----------------------------------------------------------


@pytest.mark.parametrize(
    ("stock", "average", "quantity", "unit_cost", "expected"),
    [
        ("10", "1000", "10", "1500", "1250.00"),
        ("2", "1000", "1", "1001", "1000.33"),
        # Half-up rounding: 2000.01 / 2 = 1000.005.
        ("1", "1000", "1", "1000.01", "1000.01"),
        # Without positive stock the previous average is ignored.
        ("0", "900", "5", "1200", "1200"),
        ("-3", "900", "5", "1200", "1200"),
    ],
)
def test_weighted_average_cost(
    stock: str, average: str, quantity: str, unit_cost: str, expected: str
) -> None:
    result = weighted_average_cost(
        Decimal(stock), Decimal(average), Decimal(quantity), Decimal(unit_cost)
    )
    assert result == Decimal(expected)


# --- Adjustments ---------------------------------------------------------------------


def test_entry_with_cost_updates_stock_and_costs(
    client: TestClient, db_session: Session, product: Product, keeper: User, headers: dict[str, str]
) -> None:
    response = adjust(client, headers, product, quantity="10", unit_cost="1500")

    assert response.status_code == 201
    body = response.json()
    assert body["product"]["current_stock"] == "20.00"
    assert body["product"]["average_cost"] == "1250.00"
    assert body["product"]["last_cost"] == "1500.00"
    assert body["movement"]["movement_type"] == MovementType.ADJUSTMENT_IN
    assert body["movement"]["stock_before"] == "10.00"
    assert body["movement"]["stock_after"] == "20.00"
    assert body["movement"]["unit_cost"] == "1500.00"
    assert body["movement"]["average_cost_after"] == "1250.00"
    assert body["movement"]["reason"] == "Conteo"
    assert body["movement"]["user"]["id"] == keeper.id
    db_session.refresh(product)
    assert product.current_stock == Decimal(20)


def test_initial_load_sets_cost_of_product_without_stock(
    client: TestClient, db_session: Session, category: Category, headers: dict[str, str]
) -> None:
    new_product = add_product(db_session, category, "BEB-NEW")

    body = adjust(client, headers, new_product, quantity="24", unit_cost="1800").json()

    assert body["product"]["current_stock"] == "24.00"
    assert body["product"]["average_cost"] == "1800.00"
    assert body["product"]["last_cost"] == "1800.00"


def test_entry_without_cost_keeps_costs(
    client: TestClient, product: Product, headers: dict[str, str]
) -> None:
    body = adjust(client, headers, product, quantity="5").json()

    assert body["product"]["current_stock"] == "15.00"
    assert body["product"]["average_cost"] == "1000.00"
    assert body["product"]["last_cost"] == "1000.00"
    assert body["movement"]["unit_cost"] == "1000.00"


def test_exit_uses_average_cost_and_keeps_it(
    client: TestClient, product: Product, headers: dict[str, str]
) -> None:
    response = adjust(client, headers, product, direction="out", quantity="4", reason="Vencidos")

    assert response.status_code == 201
    body = response.json()
    assert body["movement"]["movement_type"] == MovementType.ADJUSTMENT_OUT
    assert body["movement"]["stock_before"] == "10.00"
    assert body["movement"]["stock_after"] == "6.00"
    assert body["movement"]["unit_cost"] == "1000.00"
    assert body["product"]["average_cost"] == "1000.00"


def test_exit_beyond_stock_is_rejected_without_changes(
    client: TestClient, db_session: Session, product: Product, headers: dict[str, str]
) -> None:
    response = adjust(client, headers, product, direction="out", quantity="11")

    assert response.status_code == 409
    assert response.json()["code"] == "INSUFFICIENT_STOCK"
    db_session.refresh(product)
    assert product.current_stock == Decimal(10)
    assert movement_count(db_session, product) == 0


def test_exit_beyond_stock_is_allowed_when_negative_stock_is_enabled(
    client: TestClient, product: Product, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "allow_negative_stock", True)

    body = adjust(client, headers, product, direction="out", quantity="12").json()

    assert body["product"]["current_stock"] == "-2.00"
    assert body["product"]["stock_status"] == "out_of_stock"


def test_services_have_no_inventory(
    client: TestClient, db_session: Session, category: Category, headers: dict[str, str]
) -> None:
    service = add_product(db_session, category, "SRV-1", type="service", unit_of_measure="page")

    response = adjust(client, headers, service)

    assert response.status_code == 422
    assert response.json()["code"] == "SERVICE_WITHOUT_INVENTORY"


def test_countable_units_require_whole_quantities(
    client: TestClient, db_session: Session, category: Category, product: Product, headers: dict
) -> None:
    rejected = adjust(client, headers, product, quantity="1.5")
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "FRACTIONAL_QUANTITY"

    bulk = add_product(db_session, category, "GRA-1", unit_of_measure="kg")
    assert adjust(client, headers, bulk, quantity="1.5").status_code == 201


@pytest.mark.parametrize(
    "fields",
    [
        {"reason": "  "},
        {"quantity": "0"},
        {"quantity": "-1"},
        {"quantity": "1.001"},
        {"direction": "out", "unit_cost": "100"},
        {"unit_cost": "-1"},
        {"current_stock": "5"},
    ],
)
def test_invalid_adjustments_are_rejected(
    client: TestClient, product: Product, headers: dict[str, str], fields: dict[str, str]
) -> None:
    response = adjust(client, headers, product, **fields)

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_adjusting_unknown_product_returns_404(client: TestClient, headers: dict[str, str]) -> None:
    payload = {"product_id": 999999, "direction": "in", "quantity": "1", "reason": "Conteo"}

    response = client.post(ADJUSTMENTS_URL, json=payload, headers=headers)

    assert response.status_code == 404
    assert response.json()["code"] == "PRODUCT_NOT_FOUND"


# --- Movement history ----------------------------------------------------------------


def add_movement(
    db: Session, product: Product, user: User, created_at: datetime, **fields: Any
) -> InventoryMovement:
    defaults: dict[str, Any] = {
        "movement_type": MovementType.ADJUSTMENT_IN,
        "quantity": Decimal(1),
        "stock_before": Decimal(0),
        "stock_after": Decimal(1),
        "unit_cost": Decimal(0),
        "average_cost_after": Decimal(0),
        "reason": "Conteo",
    }
    movement = InventoryMovement(
        product=product, user=user, created_at=created_at, **{**defaults, **fields}
    )
    db.add(movement)
    db.flush()
    return movement


def test_movements_are_listed_newest_first_with_filters(
    client: TestClient,
    db_session: Session,
    category: Category,
    product: Product,
    keeper: User,
    headers: dict[str, str],
) -> None:
    other = add_product(db_session, category, "BEB-2")
    day = datetime(2026, 9, 1, 12, tzinfo=UTC)
    oldest = add_movement(db_session, product, keeper, day)
    exit_ = add_movement(
        db_session,
        product,
        keeper,
        day + timedelta(days=1),
        movement_type=MovementType.ADJUSTMENT_OUT,
        stock_before=Decimal(1),
        stock_after=Decimal(0),
    )
    newest = add_movement(db_session, other, keeper, day + timedelta(days=2))

    everything = client.get(MOVEMENTS_URL, headers=headers).json()
    assert [m["id"] for m in everything["items"]] == [newest.id, exit_.id, oldest.id]
    assert everything["items"][0]["product"]["sku"] == "BEB-2"

    by_product = client.get(MOVEMENTS_URL, params={"product_id": product.id}, headers=headers)
    assert [m["id"] for m in by_product.json()["items"]] == [exit_.id, oldest.id]

    by_type = client.get(MOVEMENTS_URL, params={"movement_type": "adjustment_out"}, headers=headers)
    assert [m["id"] for m in by_type.json()["items"]] == [exit_.id]

    # Bogota midnight bounds: from Sept 2 (inclusive) to Sept 3 (exclusive).
    by_date = client.get(
        MOVEMENTS_URL,
        params={"date_from": "2026-09-02T00:00:00-05:00", "date_to": "2026-09-03T00:00:00-05:00"},
        headers=headers,
    )
    assert [m["id"] for m in by_date.json()["items"]] == [exit_.id]


@pytest.mark.parametrize(
    "params",
    [
        {"date_from": "2026-09-02T00:00:00-05:00", "date_to": "2026-09-01T00:00:00-05:00"},
        {"date_from": "2026-09-02T00:00:00"},
    ],
)
def test_invalid_date_filters_are_rejected(
    client: TestClient, headers: dict[str, str], params: dict[str, str]
) -> None:
    response = client.get(MOVEMENTS_URL, params=params, headers=headers)

    assert response.status_code == 422


# --- Replenishment -------------------------------------------------------------------


def test_replenishment_lists_products_at_or_below_reorder_point(
    client: TestClient, db_session: Session, category: Category, headers: dict[str, str]
) -> None:
    levels = {
        "min_stock": Decimal(2),
        "reorder_point": Decimal(5),
        "target_stock": Decimal(20),
    }
    add_product(db_session, category, "OK", name="A ok", current_stock=Decimal(6), **levels)
    add_product(db_session, category, "LOW", name="B low", current_stock=Decimal(5), **levels)
    add_product(db_session, category, "CRIT", name="C crit", current_stock=Decimal(2), **levels)
    add_product(db_session, category, "OUT", name="D out", current_stock=Decimal(0), **levels)
    add_product(
        db_session, category, "OFF", name="E off", is_active=False, current_stock=0, **levels
    )
    add_product(db_session, category, "SRV", name="F srv", type="service")

    body = client.get(REPLENISHMENT_URL, headers=headers).json()

    assert [(i["sku"], i["stock_status"], i["suggested_quantity"]) for i in body["items"]] == [
        ("OUT", "out_of_stock", "20.00"),
        ("CRIT", "critical", "18.00"),
        ("LOW", "low", "15.00"),
    ]
    critical = client.get(REPLENISHMENT_URL, params={"stock_status": "critical"}, headers=headers)
    assert [i["sku"] for i in critical.json()["items"]] == ["CRIT"]
    searched = client.get(REPLENISHMENT_URL, params={"search": "low"}, headers=headers)
    assert [i["sku"] for i in searched.json()["items"]] == ["LOW"]


def test_replenishment_suggestion_is_never_negative(
    client: TestClient, db_session: Session, category: Category, headers: dict[str, str]
) -> None:
    # Levels not configured yet: out of stock, but there is no target to buy up to.
    add_product(db_session, category, "NOLEVELS")

    items = client.get(REPLENISHMENT_URL, headers=headers).json()["items"]

    assert [(i["sku"], i["suggested_quantity"]) for i in items] == [("NOLEVELS", "0.00")]
