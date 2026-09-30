"""Concurrency of sales, with real sessions and committed data.

As in test_purchase_concurrency, these tests commit their own rows and delete them after.
"""

import threading
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from decimal import Decimal

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.models import (
    CashMovement,
    CashRegister,
    CashSession,
    Category,
    InventoryMovement,
    PaymentMethod,
    Product,
    Role,
    Sale,
    SaleItem,
    SalePayment,
    User,
)
from app.schemas.sale import SaleCancel, SaleCreate
from app.services import sale_service
from tests.conftest import DEFAULT_PASSWORD_HASH

THREAD_TIMEOUT_SECONDS = 10

SKU_PREFIX = "CONC-SALE-"
USERNAMES = ("sale_concurrency1", "sale_concurrency2")
REGISTER_PREFIX = "Sale concurrency register"
CATEGORY_NAME = "Sale concurrency category"


def _purge_committed_rows() -> None:
    """Delete this module's rows and put the sale sequence back where it was."""
    with SessionLocal() as db:
        register_ids = select(CashRegister.id).where(CashRegister.name.startswith(REGISTER_PREFIX))
        session_ids = select(CashSession.id).where(CashSession.cash_register_id.in_(register_ids))
        sale_ids = select(Sale.id).where(Sale.cash_session_id.in_(session_ids))
        product_ids = select(Product.id).where(Product.sku.startswith(SKU_PREFIX))
        db.execute(delete(CashMovement).where(CashMovement.cash_session_id.in_(session_ids)))
        db.execute(delete(InventoryMovement).where(InventoryMovement.product_id.in_(product_ids)))
        db.execute(delete(SalePayment).where(SalePayment.sale_id.in_(sale_ids)))
        db.execute(delete(SaleItem).where(SaleItem.sale_id.in_(sale_ids)))
        db.execute(delete(Sale).where(Sale.id.in_(sale_ids)))
        db.execute(delete(CashSession).where(CashSession.id.in_(session_ids)))
        db.execute(delete(CashRegister).where(CashRegister.name.startswith(REGISTER_PREFIX)))
        db.execute(delete(Product).where(Product.sku.startswith(SKU_PREFIX)))
        db.execute(delete(Category).where(Category.name == CATEGORY_NAME))
        db.execute(delete(User).where(User.username.in_(USERNAMES)))
        # Numbers taken here would otherwise be skipped by later test runs' expectations.
        db.execute(
            text(
                "UPDATE document_sequences SET last_value = COALESCE("
                "(SELECT max(substring(number FROM '[0-9]+$')::int) FROM sales), 0) "
                "WHERE name = 'sale'"
            )
        )
        db.commit()


@dataclass
class Shop:
    user_ids: list[int]
    product_ids: list[int]
    cash_method_id: int


@pytest.fixture
def shop() -> Iterator[Shop]:
    """Two cashiers with an open session each, and two products with 1 unit each."""
    _purge_committed_rows()
    with SessionLocal() as db:
        role = db.scalars(select(Role).where(Role.code == RoleCode.ADMIN)).one()
        users = [
            User(username=name, full_name=name, password_hash=DEFAULT_PASSWORD_HASH, role=role)
            for name in USERNAMES
        ]
        sessions = [
            CashSession(
                cash_register=CashRegister(name=f"{REGISTER_PREFIX} {index}"),
                user=user,
                opening_amount=Decimal(0),
            )
            for index, user in enumerate(users)
        ]
        category = Category(name=CATEGORY_NAME)
        products = [
            Product(
                sku=f"{SKU_PREFIX}{index}",
                name=f"Sale concurrency product {index}",
                category=category,
                unit_of_measure="unit",
                sale_price=Decimal(1000),
                current_stock=Decimal(1),
            )
            for index in (1, 2)
        ]
        db.add_all([*sessions, *products])
        db.commit()
        cash = db.scalars(select(PaymentMethod.id).where(PaymentMethod.is_cash)).one()
        result = Shop([u.id for u in users], [p.id for p in products], cash)
    try:
        yield result
    finally:
        _purge_committed_rows()


def _run_concurrently(calls: list[tuple[int, Callable[[Session, User], Sale]]]) -> list[str]:
    """Run each `(user_id, call)` in its own session, all starting at once; return the sale
    numbers or error codes."""
    barrier = threading.Barrier(len(calls))
    outcomes: list[str] = []
    errors: list[BaseException] = []

    def run(user_id: int, call: Callable[[Session, User], Sale]) -> None:
        try:
            with SessionLocal() as db:
                actor = db.get_one(User, user_id)
                barrier.wait()
                try:
                    outcomes.append(call(db, actor).number)
                except AppError as exc:
                    outcomes.append(exc.code)
        except BaseException as exc:  # surfaced in the main thread
            errors.append(exc)

    threads = [threading.Thread(target=run, args=call) for call in calls]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(THREAD_TIMEOUT_SECONDS)
    assert errors == []
    assert not any(thread.is_alive() for thread in threads)
    return outcomes


def _sale_of(shop: Shop, product_id: int) -> Callable[[Session, User], Sale]:
    data = SaleCreate(
        items=[{"product_id": product_id, "quantity": Decimal(1)}],
        payments=[{"payment_method_id": shop.cash_method_id, "amount": Decimal(1000)}],
    )
    return lambda db, actor: sale_service.create_sale(db, actor, data)


def test_last_unit_sold_twice_at_once_is_sold_once(shop: Shop) -> None:
    """Without the product lock both sales would read 1 unit and leave the stock at -1."""
    product_id = shop.product_ids[0]

    outcomes = _run_concurrently([(uid, _sale_of(shop, product_id)) for uid in shop.user_ids])

    assert sorted(o.split("-")[0] for o in outcomes) == ["INSUFFICIENT_STOCK", "VENTA"]
    with SessionLocal() as db:
        assert db.get_one(Product, product_id).current_stock == Decimal(0)


def test_concurrent_sales_get_consecutive_numbers(shop: Shop) -> None:
    """Different products and sessions: only the sequence lock protects the numbers."""
    calls = [
        (user_id, _sale_of(shop, product_id))
        for user_id, product_id in zip(shop.user_ids, shop.product_ids, strict=True)
    ]

    numbers = _run_concurrently(calls)

    values = sorted(int(number.removeprefix("VENTA-")) for number in numbers)
    assert values[1] == values[0] + 1


def test_same_sale_cancelled_twice_at_once_is_reversed_once(shop: Shop) -> None:
    product_id = shop.product_ids[0]
    with SessionLocal() as db:
        seller = db.get_one(User, shop.user_ids[0])
        sale_id = _sale_of(shop, product_id)(db, seller).id
    data = SaleCancel(reason="Cancelación concurrente")

    def cancel(db: Session, actor: User) -> Sale:
        return sale_service.cancel_sale(db, actor, sale_id, data)

    outcomes = _run_concurrently([(uid, cancel) for uid in shop.user_ids])

    assert sorted(o.split("-")[0] for o in outcomes) == ["SALE_ALREADY_CANCELLED", "VENTA"]
    with SessionLocal() as db:
        assert db.get_one(Product, product_id).current_stock == Decimal(1)
        refunds = db.scalars(
            select(CashMovement).where(
                CashMovement.sale_id == sale_id, CashMovement.movement_type == "sale_cancellation"
            )
        ).all()
        assert len(refunds) == 1
