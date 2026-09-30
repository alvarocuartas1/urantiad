from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.permissions import RoleCode
from app.models import (
    CashMovement,
    CashRegister,
    CashSession,
    Category,
    Customer,
    DocumentSequence,
    InventoryMovement,
    MovementType,
    PaymentMethod,
    Product,
    Sale,
    User,
)
from app.services.sale_service import allocate
from tests.conftest import UserFactory
from tests.test_cash import add_register, add_session, post_movement
from tests.test_categories import add_category
from tests.test_customers import add_customer
from tests.test_products import add_product

AuthHeaders = Callable[[User], dict[str, str]]

SALES_URL = "/api/v1/sales"
PAYMENT_METHODS_URL = "/api/v1/payment-methods"
SESSIONS_URL = "/api/v1/cash-sessions"


@pytest.fixture
def category(db_session: Session) -> Category:
    return add_category(db_session, "Bebidas")


@pytest.fixture
def water(db_session: Session, category: Category) -> Product:
    """2.000 without tax, 10 units at an average cost of 1.200."""
    return add_product(
        db_session,
        category,
        "AGUA-1",
        sale_price=Decimal(2000),
        current_stock=Decimal(10),
        average_cost=Decimal(1200),
        last_cost=Decimal(1300),
    )


@pytest.fixture
def soda(db_session: Session, category: Category) -> Product:
    """5.950 with 19 % tax included, 5 units."""
    return add_product(
        db_session,
        category,
        "GASEOSA-1",
        sale_price=Decimal(5950),
        tax_rate=Decimal(19),
        current_stock=Decimal(5),
        average_cost=Decimal(3000),
        last_cost=Decimal(3000),
    )


@pytest.fixture
def copy_service(db_session: Session, category: Category) -> Product:
    return add_product(
        db_session,
        category,
        "COPIA-BN",
        type="service",
        unit_of_measure="page",
        sale_price=Decimal(200),
        average_cost=Decimal(50),
        last_cost=Decimal(50),
    )


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


def method_id(db: Session, code: str) -> int:
    return db.scalars(select(PaymentMethod.id).where(PaymentMethod.code == code)).one()


def item(product: Product, quantity: str = "1", **fields: Any) -> dict[str, Any]:
    return {"product_id": product.id, "quantity": quantity, **fields}


def pay(db: Session, code: str, amount: str, **fields: Any) -> dict[str, Any]:
    return {"payment_method_id": method_id(db, code), "amount": amount, **fields}


def post_sale(
    client: TestClient,
    headers: dict[str, str],
    items: list[dict[str, Any]],
    payments: list[dict[str, Any]],
    **fields: Any,
) -> Any:
    payload = {"items": items, "payments": payments, **fields}
    return client.post(SALES_URL, json=payload, headers=headers)


def sell(
    client: TestClient,
    headers: dict[str, str],
    items: list[dict[str, Any]],
    payments: list[dict[str, Any]],
    **fields: Any,
) -> Any:
    response = post_sale(client, headers, items, payments, **fields)
    assert response.status_code == 201, response.json()
    return response.json()


def cancel(client: TestClient, headers: dict[str, str], sale_id: int) -> Any:
    return client.post(
        f"{SALES_URL}/{sale_id}/cancel", json={"reason": "Cobro duplicado"}, headers=headers
    )


def sale_number(db: Session, offset: int) -> str:
    """Number the sequence will give `offset` sales from now (1 = the next one)."""
    last_value = db.scalars(
        select(DocumentSequence.last_value).where(DocumentSequence.name == "sale")
    ).one()
    return f"VENTA-{last_value + offset:06d}"


def movements(db: Session, product: Product) -> list[InventoryMovement]:
    stmt = (
        select(InventoryMovement)
        .where(InventoryMovement.product_id == product.id)
        .order_by(InventoryMovement.id)
    )
    return list(db.scalars(stmt))


def cash_movements(db: Session, session: CashSession) -> list[CashMovement]:
    stmt = (
        select(CashMovement)
        .where(CashMovement.cash_session_id == session.id)
        .order_by(CashMovement.id)
    )
    return list(db.scalars(stmt))


def session_summary(client: TestClient, headers: dict[str, str], session_id: int) -> Any:
    return client.get(f"{SESSIONS_URL}/{session_id}", headers=headers).json()["summary"]


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("get", PAYMENT_METHODS_URL),
        ("get", SALES_URL),
        ("post", SALES_URL),
        ("get", f"{SALES_URL}/1"),
        ("post", f"{SALES_URL}/1/cancel"),
    ],
)
def test_inventory_role_has_no_sales_access(
    client: TestClient, make_user: UserFactory, auth_headers: AuthHeaders, method: str, url: str
) -> None:
    headers = auth_headers(make_user(RoleCode.INVENTORY))
    assert client.request(method, url, headers=headers, json={}).status_code == 403


def test_cashier_cannot_cancel_sales(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])

    response = cancel(client, headers, sale["id"])

    assert response.status_code == 403


def test_payment_methods_are_seeded_in_order(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get(PAYMENT_METHODS_URL, headers=headers)

    assert response.status_code == 200
    methods = response.json()
    assert [m["code"] for m in methods] == [
        "cash",
        "nequi",
        "daviplata",
        "transfer",
        "debit_card",
        "credit_card",
        "other",
    ]
    assert [m["code"] for m in methods if m["is_cash"]] == ["cash"]


def test_inactive_payment_methods_are_not_listed(
    client: TestClient, db_session: Session, headers: dict[str, str]
) -> None:
    db_session.get_one(PaymentMethod, method_id(db_session, "other")).is_active = False
    db_session.flush()

    codes = [m["code"] for m in client.get(PAYMENT_METHODS_URL, headers=headers).json()]

    assert "other" not in codes


# --- Creation ------------------------------------------------------------------------


def test_cash_sale_moves_inventory_and_cash(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    cashier: User,
    water: Product,
    soda: Product,
) -> None:
    number = sale_number(db_session, 1)

    sale = sell(
        client,
        headers,
        [item(water, "2"), item(soda)],
        [pay(db_session, "cash", "9950", amount_tendered="20000")],
    )

    assert sale["number"] == number
    assert sale["status"] == "completed"
    assert sale["customer"]["is_default"] is True
    assert sale["user"]["id"] == cashier.id
    assert sale["cash_session_id"] == session.id
    assert sale["cash_register"]["name"] == "Caja Test"
    assert sale["subtotal"] == "9950.00"
    assert sale["discount_total"] == "0.00"
    assert sale["total"] == "9950.00"
    assert sale["tax_total"] == "950.00"  # 5.950 x 19 / 119
    assert sale["change_amount"] == "10050.00"
    assert sale["payments"][0]["payment_method"]["code"] == "cash"
    assert sale["payments"][0]["amount_tendered"] == "20000.00"
    assert sale["payments"][0]["change_amount"] == "10050.00"
    lines = {line["product"]["id"]: line for line in sale["items"]}
    assert lines[water.id]["unit_price"] == "2000.00"
    assert lines[water.id]["total"] == "4000.00"
    assert lines[water.id]["tax_amount"] == "0.00"
    # The cashier cannot see costs.
    assert lines[water.id]["unit_cost"] is None

    db_session.expire_all()
    assert water.current_stock == Decimal(8)
    assert soda.current_stock == Decimal(4)
    [exit_] = movements(db_session, water)
    assert exit_.movement_type == MovementType.SALE
    assert exit_.sale_id == sale["id"]
    assert exit_.unit_cost == Decimal(1200)
    assert (exit_.stock_before, exit_.stock_after) == (Decimal(10), Decimal(8))
    [cash_in] = cash_movements(db_session, session)
    assert cash_in.movement_type == "sale"
    assert cash_in.amount == Decimal(9950)
    assert cash_in.sale_id == sale["id"]
    assert cash_in.concept == f"Venta {number}"

    summary = session_summary(client, headers, session.id)
    assert summary["total_cash_sales"] == "9950.00"
    assert summary["expected_cash"] == "109950.00"


def test_sale_stores_the_cost_of_the_moment(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    water.average_cost = Decimal(1500)
    db_session.flush()

    detail = client.get(f"{SALES_URL}/{sale['id']}", headers=admin_headers).json()

    assert detail["items"][0]["unit_cost"] == "1200.00"


def test_mixed_payment_only_moves_the_cash_part(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    soda: Product,
) -> None:
    sale = sell(
        client,
        headers,
        [item(soda)],
        [
            pay(db_session, "nequi", "3000", reference="M123"),
            pay(db_session, "cash", "2950", amount_tendered="5000"),
        ],
    )

    assert sale["change_amount"] == "2050.00"
    assert [p["reference"] for p in sale["payments"]] == ["M123", None]
    [cash_in] = cash_movements(db_session, session)
    assert cash_in.amount == Decimal(2950)


def test_sale_without_cash_creates_no_cash_movement(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sell(client, headers, [item(water)], [pay(db_session, "debit_card", "2000")])

    assert cash_movements(db_session, session) == []


def test_services_do_not_move_inventory(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    copy_service: Product,
) -> None:
    sale = sell(client, headers, [item(copy_service, "25")], [pay(db_session, "cash", "5000")])

    assert movements(db_session, copy_service) == []
    detail = client.get(f"{SALES_URL}/{sale['id']}", headers=admin_headers).json()
    assert detail["items"][0]["unit_cost"] == "50.00"
    assert detail["total"] == "5000.00"


def test_discounts_are_split_among_lines(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
    soda: Product,
) -> None:
    """Water 3 x 2.000 - 500 = 5.500 and soda 5.950 share a sale discount of 1.000 in
    proportion (480,35 and 519,65), so each line's tax is computed on what it really costs."""
    sale = sell(
        client,
        headers,
        [item(water, "3", discount="500"), item(soda)],
        [pay(db_session, "cash", "10450")],
        sale_discount="1000",
    )

    assert sale["subtotal"] == "11950.00"
    assert sale["lines_discount"] == "500.00"
    assert sale["sale_discount"] == "1000.00"
    assert sale["discount_total"] == "1500.00"
    assert sale["total"] == "10450.00"
    lines = {line["product"]["id"]: line for line in sale["items"]}
    assert lines[water.id]["sale_discount_share"] == "480.35"
    assert lines[water.id]["total"] == "5019.65"
    assert lines[soda.id]["sale_discount_share"] == "519.65"
    assert lines[soda.id]["total"] == "5430.35"
    assert lines[soda.id]["tax_amount"] == "867.03"  # 5.430,35 x 19 / 119
    assert sale["tax_total"] == "867.03"


@pytest.mark.parametrize(
    ("amount", "weights", "expected"),
    [
        ("0", ["10", "20"], ["0", "0"]),
        ("0.01", ["0.01", "0.01", "0.01"], ["0.01", "0", "0"]),
        ("0.03", ["0.01", "0.01", "0.01"], ["0.01", "0.01", "0.01"]),
        ("100", ["1", "2"], ["33.33", "66.67"]),
        ("5", ["0", "10"], ["0", "5"]),
    ],
)
def test_allocate_splits_in_whole_cents(
    amount: str, weights: list[str], expected: list[str]
) -> None:
    shares = allocate(Decimal(amount), [Decimal(w) for w in weights])

    assert shares == [Decimal(e) for e in expected]
    assert sum(shares) == Decimal(amount)


def test_sale_for_a_registered_customer(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    customer = add_customer(db_session, "Ana Pérez", "1020304050")

    sale = sell(
        client,
        headers,
        [item(water)],
        [pay(db_session, "cash", "2000")],
        customer_id=customer.id,
    )

    assert sale["customer"]["id"] == customer.id


def test_numbers_are_consecutive(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    expected = [sale_number(db_session, 1), sale_number(db_session, 2)]

    numbers = [
        sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])["number"]
        for _ in range(2)
    ]

    assert numbers == expected


def test_sale_requires_an_open_cash_session(
    client: TestClient, db_session: Session, headers: dict[str, str], water: Product
) -> None:
    response = post_sale(client, headers, [item(water)], [pay(db_session, "cash", "2000")])

    assert response.status_code == 409
    assert response.json()["code"] == "NO_OPEN_CASH_SESSION"


def _invalid_sale_cases(db: Session, water: Product, soda: Product) -> list[tuple[Any, ...]]:
    """(items, payments, extra fields, status, code) of sales that must be rejected."""
    cash = method_id(db, "cash")
    nequi = method_id(db, "nequi")

    def payment(method: int, amount: str, **fields: Any) -> dict[str, Any]:
        return {"payment_method_id": method, "amount": amount, **fields}

    return [
        ([item(water)], [payment(cash, "1999")], {}, 422, "PAYMENT_TOTAL_MISMATCH"),
        ([item(water)], [], {}, 422, "PAYMENT_TOTAL_MISMATCH"),
        (
            [item(water)],
            [payment(cash, "2000", amount_tendered="1000")],
            {},
            422,
            "INSUFFICIENT_TENDERED",
        ),
        (
            [item(water)],
            [payment(nequi, "2000", amount_tendered="5000")],
            {},
            422,
            "TENDERED_ONLY_FOR_CASH",
        ),
        ([item(water)], [payment(999999, "2000")], {}, 422, "PAYMENT_METHOD_NOT_FOUND"),
        (
            [item(water, discount="2000.01")],
            [payment(cash, "0.01")],
            {},
            422,
            "LINE_DISCOUNT_EXCEEDS_VALUE",
        ),
        (
            [item(water)],
            [payment(cash, "2000")],
            {"sale_discount": "2000.01"},
            422,
            "SALE_DISCOUNT_EXCEEDS_VALUE",
        ),
        ([item(water, "1.5")], [payment(cash, "3000")], {}, 422, "FRACTIONAL_QUANTITY"),
        (
            [{"product_id": 999999, "quantity": "1"}],
            [payment(cash, "2000")],
            {},
            422,
            "PRODUCT_NOT_FOUND",
        ),
        ([item(water), item(water)], [payment(cash, "4000")], {}, 422, "VALIDATION_ERROR"),
        ([], [payment(cash, "2000")], {}, 422, "VALIDATION_ERROR"),
        (
            [item(water)],
            [payment(cash, "1000"), payment(cash, "1000")],
            {},
            422,
            "VALIDATION_ERROR",
        ),
        (
            [item(water), item(soda, "6")],
            [payment(cash, "37700")],
            {},
            409,
            "INSUFFICIENT_STOCK",
        ),
    ]


@pytest.mark.parametrize("case", range(13))
def test_invalid_sales_change_nothing(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
    soda: Product,
    case: int,
) -> None:
    cases = _invalid_sale_cases(db_session, water, soda)
    assert len(cases) == 13
    items, payments, fields, status, code = cases[case]
    next_number = sale_number(db_session, 1)
    # Committed, so the service's rollback only undoes the request (not the fixtures) and the
    # checks below read the database.
    db_session.commit()

    response = post_sale(client, headers, items, payments, **fields)

    assert response.status_code == status, response.json()
    assert response.json()["code"] == code
    db_session.expire_all()
    assert water.current_stock == Decimal(10)
    assert soda.current_stock == Decimal(5)
    assert db_session.scalar(select(func.count()).select_from(Sale)) == 0
    assert cash_movements(db_session, session) == []
    assert sale_number(db_session, 1) == next_number


def test_insufficient_stock_names_the_line(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
    soda: Product,
) -> None:
    response = post_sale(
        client,
        headers,
        [item(water), item(soda, "6")],
        [pay(db_session, "cash", "37700")],
    )

    assert response.json()["detail"].startswith("Línea 2: Stock insuficiente")


@pytest.mark.parametrize(
    ("setup", "code"),
    [
        ("inactive_product", "PRODUCT_INACTIVE"),
        ("inactive_customer", "CUSTOMER_INACTIVE"),
        ("inactive_method", "PAYMENT_METHOD_INACTIVE"),
    ],
)
def test_inactive_records_cannot_be_used(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
    setup: str,
    code: str,
) -> None:
    customer = add_customer(db_session, "Ana", "123", is_active=setup != "inactive_customer")
    water.is_active = setup != "inactive_product"
    method = db_session.get_one(PaymentMethod, method_id(db_session, "nequi"))
    method.is_active = setup != "inactive_method"
    db_session.flush()

    response = post_sale(
        client,
        headers,
        [item(water)],
        [pay(db_session, "nequi", "2000")],
        customer_id=customer.id,
    )

    assert response.status_code == 422
    assert response.json()["code"] == code


def test_negative_stock_can_be_enabled(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    soda: Product,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "allow_negative_stock", True)

    sell(client, headers, [item(soda, "6")], [pay(db_session, "cash", "35700")])

    db_session.expire_all()
    assert soda.current_stock == Decimal(-1)


# --- Queries -------------------------------------------------------------------------


def test_cashier_only_sees_own_sales(
    client: TestClient,
    db_session: Session,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    other = make_user(RoleCode.CASHIER)
    add_session(db_session, add_register(db_session, "Caja 2"), other, Decimal(0))
    other_headers = auth_headers(other)
    mine = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    theirs = sell(client, other_headers, [item(water)], [pay(db_session, "cash", "2000")])

    listed = client.get(SALES_URL, headers=headers).json()
    assert [s["id"] for s in listed["items"]] == [mine["id"]]
    assert client.get(f"{SALES_URL}/{theirs['id']}", headers=headers).status_code == 404

    all_sales = client.get(SALES_URL, headers=admin_headers).json()
    assert {s["id"] for s in all_sales["items"]} == {mine["id"], theirs["id"]}
    by_user = client.get(SALES_URL, params={"user_id": other.id}, headers=admin_headers).json()
    assert [s["id"] for s in by_user["items"]] == [theirs["id"]]


def test_list_sales_filters(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    customer = add_customer(db_session, "Ana Pérez", "1020304050")
    first = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    second = sell(
        client,
        headers,
        [item(water)],
        [pay(db_session, "cash", "2000")],
        customer_id=customer.id,
    )
    assert cancel(client, admin_headers, first["id"]).status_code == 200

    def ids(**params: Any) -> list[int]:
        body = client.get(SALES_URL, params=params, headers=headers).json()
        return [s["id"] for s in body["items"]]

    assert ids() == [second["id"], first["id"]]
    assert ids(search="ana") == [second["id"]]
    assert ids(search="1020304") == [second["id"]]
    assert ids(search=first["number"]) == [first["id"]]
    assert ids(status="cancelled") == [first["id"]]
    assert ids(customer_id=customer.id) == [second["id"]]
    assert ids(cash_session_id=session.id) == [second["id"], first["id"]]


def test_missing_sale_returns_404(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get(f"{SALES_URL}/999999", headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["code"] == "SALE_NOT_FOUND"


def test_inventory_movements_reference_the_sale(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])

    body = client.get(
        "/api/v1/inventory/movements", params={"product_id": water.id}, headers=admin_headers
    ).json()

    assert body["items"][0]["sale"] == {"id": sale["id"], "number": sale["number"]}
    assert body["items"][0]["purchase"] is None


def test_cash_movements_reference_the_sale(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])

    body = client.get(f"{SESSIONS_URL}/{session.id}/movements", headers=headers).json()

    assert body["items"][0]["movement_type"] == "sale"
    assert body["items"][0]["sale"] == {"id": sale["id"], "number": sale["number"]}


def test_sale_cash_movements_cannot_be_registered_by_hand(
    client: TestClient, headers: dict[str, str], session: CashSession
) -> None:
    for movement_type in ("sale", "sale_cancellation"):
        response = post_movement(client, session.id, headers, movement_type, "1000")
        assert response.status_code == 422


def test_sale_cash_movement_must_be_linked_to_a_sale(
    db_session: Session, session: CashSession, cashier: User
) -> None:
    db_session.add(
        CashMovement(
            cash_session_id=session.id,
            movement_type="sale",
            amount=Decimal(1000),
            concept="Sin venta",
            user=cashier,
        )
    )

    with pytest.raises(IntegrityError, match="ck_cash_movements_sale_movement_linked"):
        db_session.flush()


# --- Cancellation --------------------------------------------------------------------


def test_cancel_reverses_inventory_and_cash(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    admin: User,
    session: CashSession,
    water: Product,
    copy_service: Product,
) -> None:
    sale = sell(
        client,
        headers,
        [item(water, "2"), item(copy_service, "10")],
        [pay(db_session, "nequi", "1000"), pay(db_session, "cash", "5000")],
    )

    response = cancel(client, admin_headers, sale["id"])

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["cancelled_by"]["id"] == admin.id
    assert body["cancellation_reason"] == "Cobro duplicado"
    assert body["cancelled_at"] is not None
    db_session.expire_all()
    assert water.current_stock == Decimal(10)
    # Units come back at the cost they left with; the last cost is still the last purchase's.
    assert water.average_cost == Decimal(1200)
    assert water.last_cost == Decimal(1300)
    entry = movements(db_session, water)[-1]
    assert entry.movement_type == MovementType.SALE_CANCELLATION
    assert entry.unit_cost == Decimal(1200)
    assert entry.reason == "Cobro duplicado"
    assert entry.sale_id == sale["id"]
    assert movements(db_session, copy_service) == []
    refund = cash_movements(db_session, session)[-1]
    assert refund.movement_type == "sale_cancellation"
    assert refund.amount == Decimal(5000)
    assert refund.user_id == admin.id
    assert refund.concept == f"Anulación de la venta {sale['number']}"

    summary = session_summary(client, headers, session.id)
    assert summary["total_cash_sales"] == "5000.00"
    assert summary["total_cash_cancellations"] == "5000.00"
    assert summary["expected_cash"] == "100000.00"


def test_cancelled_units_recalculate_the_average_cost(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water, "2")], [pay(db_session, "cash", "4000")])
    # A later entry changed the average: 8 units at 1.500 now.
    water.average_cost = Decimal(1500)
    db_session.flush()

    assert cancel(client, admin_headers, sale["id"]).status_code == 200

    db_session.expire_all()
    assert water.average_cost == Decimal(1440)  # (8 x 1.500 + 2 x 1.200) / 10


def test_sale_cannot_be_cancelled_twice(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    assert cancel(client, admin_headers, sale["id"]).status_code == 200

    response = cancel(client, admin_headers, sale["id"])

    assert response.status_code == 409
    assert response.json()["code"] == "SALE_ALREADY_CANCELLED"
    db_session.expire_all()
    assert water.current_stock == Decimal(10)


def test_cancel_fails_without_changes_when_the_drawer_lacks_the_cash(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    assert post_movement(client, session.id, headers, "withdrawal", "101000").status_code == 201

    response = cancel(client, admin_headers, sale["id"])

    assert response.status_code == 409
    assert response.json()["code"] == "INSUFFICIENT_CASH"
    db_session.expire_all()
    assert db_session.get_one(Sale, sale["id"]).status == "completed"
    assert water.current_stock == Decimal(9)


def test_cancel_after_the_session_closed_refunds_from_the_actor_session(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    admin: User,
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])
    session.status = "closed"
    db_session.commit()  # the failed cancellation's rollback must not reopen it

    response = cancel(client, admin_headers, sale["id"])
    assert response.status_code == 409
    assert response.json()["code"] == "CASH_SESSION_REQUIRED"

    own = add_session(db_session, add_register(db_session, "Caja Admin"), admin, Decimal(10000))
    assert cancel(client, admin_headers, sale["id"]).status_code == 200
    [refund] = cash_movements(db_session, own)
    assert refund.movement_type == "sale_cancellation"
    assert refund.amount == Decimal(2000)


def test_cancel_without_cash_needs_no_open_session(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "transfer", "2000")])
    session.status = "closed"
    db_session.flush()

    response = cancel(client, admin_headers, sale["id"])

    assert response.status_code == 200
    assert cash_movements(db_session, session) == []


def test_cancel_requires_a_reason(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    admin_headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])

    response = client.post(
        f"{SALES_URL}/{sale['id']}/cancel", json={"reason": "  "}, headers=admin_headers
    )

    assert response.status_code == 422


def test_default_customer_is_used_when_omitted(
    client: TestClient,
    db_session: Session,
    headers: dict[str, str],
    session: CashSession,
    water: Product,
) -> None:
    default = db_session.scalars(select(Customer).where(Customer.is_default)).one()

    sale = sell(client, headers, [item(water)], [pay(db_session, "cash", "2000")])

    assert sale["customer"]["id"] == default.id
