"""Concurrency of stock movements, with two real sessions and committed data.

The per-test rollback fixtures share one connection, so they cannot show row locking.
These tests commit their own rows and delete them afterwards.
"""

import threading
from collections.abc import Iterator
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from app.core.database import SessionLocal
from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.models import Category, InventoryMovement, MovementType, Product, Role, User
from app.schemas.inventory import AdjustmentCreate, AdjustmentDirection
from app.services import inventory_service
from app.services.product_service import get_product
from tests.conftest import DEFAULT_PASSWORD_HASH

# Long enough to be sure the second session is waiting on the row lock, not just slow.
LOCK_WAIT_SECONDS = 0.5
THREAD_TIMEOUT_SECONDS = 10


SKU = "CONC-001"
USERNAME = "concurrency_keeper"
CATEGORY_NAME = "Concurrency category"


def _purge_committed_rows() -> None:
    """Delete this module's rows, including leftovers of a run that was killed mid-test."""
    with SessionLocal() as db:
        product_ids = select(Product.id).where(Product.sku == SKU).scalar_subquery()
        db.execute(delete(InventoryMovement).where(InventoryMovement.product_id.in_(product_ids)))
        db.execute(delete(Product).where(Product.sku == SKU))
        db.execute(delete(Category).where(Category.name == CATEGORY_NAME))
        db.execute(delete(User).where(User.username == USERNAME))
        db.commit()


@pytest.fixture
def committed_product() -> Iterator[tuple[int, int]]:
    """A product with 10 units and a user, committed; returns `(product_id, user_id)`."""
    _purge_committed_rows()
    with SessionLocal() as db:
        role = db.scalars(select(Role).where(Role.code == RoleCode.INVENTORY)).one()
        user = User(
            username=USERNAME,
            full_name="Concurrency keeper",
            password_hash=DEFAULT_PASSWORD_HASH,
            role=role,
        )
        category = Category(name=CATEGORY_NAME)
        product = Product(
            sku=SKU,
            name="Concurrency product",
            category=category,
            unit_of_measure="unit",
            sale_price=Decimal(1000),
            current_stock=Decimal(10),
            average_cost=Decimal(500),
        )
        db.add_all([user, product])
        db.commit()
        ids = (product.id, user.id)
    try:
        yield ids
    finally:
        _purge_committed_rows()


def test_concurrent_exits_cannot_oversell(committed_product: tuple[int, int]) -> None:
    """Two exits of 6 units over a stock of 10: the second must see 4 units and fail.

    Without the row lock both sessions would read 10, both would succeed and the stock
    would end at 4 with 12 units sold (a lost update).
    """
    product_id, user_id = committed_product
    second_result: dict[str, object] = {}

    def second_exit() -> None:
        with SessionLocal() as db:
            actor = db.get_one(User, user_id)
            data = AdjustmentCreate(
                product_id=product_id,
                direction=AdjustmentDirection.OUT,
                quantity=Decimal(6),
                reason="Salida concurrente",
            )
            try:
                inventory_service.create_adjustment(db, actor, data)
                second_result["outcome"] = "committed"
            except AppError as exc:
                second_result["outcome"] = exc.code

    with SessionLocal() as first:
        actor = first.get_one(User, user_id)
        product = get_product(first, product_id, for_update=True)

        second = threading.Thread(target=second_exit)
        second.start()
        second.join(LOCK_WAIT_SECONDS)
        assert second.is_alive(), "the second session should be waiting for the row lock"

        inventory_service.record_movement(
            first,
            product,
            MovementType.ADJUSTMENT_OUT,
            Decimal(6),
            actor,
            reason="Primera salida",
        )
        first.commit()

    second.join(THREAD_TIMEOUT_SECONDS)
    assert not second.is_alive()
    assert second_result["outcome"] == "INSUFFICIENT_STOCK"

    with SessionLocal() as db:
        assert db.get_one(Product, product_id).current_stock == Decimal(4)
        movements = db.scalars(
            select(InventoryMovement).where(InventoryMovement.product_id == product_id)
        ).all()
        assert [(m.stock_before, m.stock_after) for m in movements] == [(Decimal(10), Decimal(4))]


def test_concurrent_entries_are_applied_in_sequence(committed_product: tuple[int, int]) -> None:
    """Two entries racing on the same product: each one starts from the other's result."""
    product_id, user_id = committed_product
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def entry(quantity: int) -> None:
        try:
            with SessionLocal() as db:
                actor = db.get_one(User, user_id)
                data = AdjustmentCreate(
                    product_id=product_id,
                    direction=AdjustmentDirection.IN,
                    quantity=Decimal(quantity),
                    unit_cost=Decimal(800),
                    reason="Entrada concurrente",
                )
                barrier.wait()
                inventory_service.create_adjustment(db, actor, data)
        except BaseException as exc:  # surfaced in the main thread
            errors.append(exc)

    threads = [threading.Thread(target=entry, args=(q,)) for q in (3, 5)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(THREAD_TIMEOUT_SECONDS)

    assert errors == []
    with SessionLocal() as db:
        product = db.get_one(Product, product_id)
        assert product.current_stock == Decimal(18)
        movements = db.scalars(
            select(InventoryMovement)
            .where(InventoryMovement.product_id == product_id)
            .order_by(InventoryMovement.id)
        ).all()
        # The movements form an unbroken chain: 10 -> x -> 18.
        assert movements[0].stock_before == Decimal(10)
        assert movements[0].stock_after == movements[1].stock_before
        assert movements[1].stock_after == Decimal(18)
        # Both entries at 800 over 10 units at 500: (5000 + 6400) / 18 = 633.33.
        assert product.average_cost == Decimal("633.33")
