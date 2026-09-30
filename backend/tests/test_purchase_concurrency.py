"""Concurrency of purchase confirmations, with real sessions and committed data.

As in test_inventory_concurrency, these tests commit their own rows and delete them after.
"""

import threading
from collections.abc import Iterator
from dataclasses import dataclass
from decimal import Decimal

import pytest
from sqlalchemy import delete, select, text

from app.core.database import SessionLocal
from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.models import (
    Category,
    InventoryMovement,
    Product,
    Purchase,
    PurchaseItem,
    Role,
    Supplier,
    SupplierProduct,
    User,
)
from app.services import purchase_service
from tests.conftest import DEFAULT_PASSWORD_HASH, purge_audit_logs

THREAD_TIMEOUT_SECONDS = 10

SKU_PREFIX = "CONC-PUR-"
USERNAME = "purchase_concurrency"
CATEGORY_NAME = "Purchase concurrency category"
SUPPLIER_DOCUMENT = "999999999-9"


def _purge_committed_rows() -> None:
    """Delete this module's rows and put the purchase sequence back where it was."""
    with SessionLocal() as db:
        is_ours = Product.sku.startswith(SKU_PREFIX)
        product_ids = select(Product.id).where(is_ours).scalar_subquery()
        supplier_ids = (
            select(Supplier.id).where(Supplier.document_number == SUPPLIER_DOCUMENT)
        ).scalar_subquery()
        purchase_ids = select(Purchase.id).where(Purchase.supplier_id.in_(supplier_ids))
        db.execute(delete(InventoryMovement).where(InventoryMovement.product_id.in_(product_ids)))
        db.execute(delete(PurchaseItem).where(PurchaseItem.purchase_id.in_(purchase_ids)))
        db.execute(delete(Purchase).where(Purchase.supplier_id.in_(supplier_ids)))
        db.execute(delete(SupplierProduct).where(SupplierProduct.supplier_id.in_(supplier_ids)))
        db.execute(delete(Supplier).where(Supplier.document_number == SUPPLIER_DOCUMENT))
        db.execute(delete(Product).where(is_ours))
        db.execute(delete(Category).where(Category.name == CATEGORY_NAME))
        purge_audit_logs(db, select(User.id).where(User.username == USERNAME))
        db.execute(delete(User).where(User.username == USERNAME))
        # Numbers taken here would otherwise be skipped by later test runs' expectations.
        db.execute(
            text(
                "UPDATE document_sequences SET last_value = COALESCE("
                "(SELECT max(substring(number FROM '[0-9]+$')::int) FROM purchases), 0) "
                "WHERE name = 'purchase'"
            )
        )
        db.commit()


@dataclass
class Drafts:
    user_id: int
    product_ids: list[int]
    purchase_ids: list[int]


@pytest.fixture
def drafts() -> Iterator[Drafts]:
    """Two committed drafts buying 5 and 7 units of two different products.

    Different products keep the product locks from serializing the confirmations, so only
    the sequence lock protects the numbers.
    """
    _purge_committed_rows()
    with SessionLocal() as db:
        role = db.scalars(select(Role).where(Role.code == RoleCode.INVENTORY)).one()
        user = User(
            username=USERNAME,
            full_name="Purchase concurrency",
            password_hash=DEFAULT_PASSWORD_HASH,
            role=role,
        )
        category = Category(name=CATEGORY_NAME)
        products = [
            Product(
                sku=f"{SKU_PREFIX}{index}",
                name=f"Purchase concurrency product {index}",
                category=category,
                unit_of_measure="unit",
                sale_price=Decimal(1000),
            )
            for index in (1, 2)
        ]
        supplier = Supplier(
            document_type="nit", document_number=SUPPLIER_DOCUMENT, name="Concurrency supplier"
        )
        purchases = [
            Purchase(
                supplier=supplier,
                created_by=user,
                subtotal=Decimal(quantity * 100),
                total=Decimal(quantity * 100),
                balance_due=Decimal(quantity * 100),
                items=[
                    PurchaseItem(
                        product=product,
                        quantity=Decimal(quantity),
                        unit_cost=Decimal(100),
                        subtotal=Decimal(quantity * 100),
                        total=Decimal(quantity * 100),
                    )
                ],
            )
            for product, quantity in zip(products, (5, 7), strict=True)
        ]
        db.add_all(purchases)
        db.commit()
        result = Drafts(user.id, [p.id for p in products], [p.id for p in purchases])
    try:
        yield result
    finally:
        _purge_committed_rows()


def _confirm_in_threads(user_id: int, purchase_ids: list[int]) -> list[str]:
    """Confirm each purchase id in its own session, all starting at once."""
    barrier = threading.Barrier(len(purchase_ids))
    outcomes: list[str] = []
    errors: list[BaseException] = []

    def run(purchase_id: int) -> None:
        try:
            with SessionLocal() as db:
                actor = db.get_one(User, user_id)
                barrier.wait()
                try:
                    purchase = purchase_service.confirm_purchase(db, actor, purchase_id)
                    outcomes.append(purchase.number or "")
                except AppError as exc:
                    outcomes.append(exc.code)
        except BaseException as exc:  # surfaced in the main thread
            errors.append(exc)

    threads = [threading.Thread(target=run, args=(pid,)) for pid in purchase_ids]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(THREAD_TIMEOUT_SECONDS)
    assert errors == []
    assert not any(thread.is_alive() for thread in threads)
    return outcomes


def test_concurrent_confirmations_get_consecutive_numbers(drafts: Drafts) -> None:
    numbers = _confirm_in_threads(drafts.user_id, drafts.purchase_ids)

    assert len(set(numbers)) == 2
    values = sorted(int(number.removeprefix("COMPRA-")) for number in numbers)
    assert values[1] == values[0] + 1
    with SessionLocal() as db:
        stocks = [db.get_one(Product, pid).current_stock for pid in drafts.product_ids]
        assert stocks == [Decimal(5), Decimal(7)]


def test_same_purchase_confirmed_twice_at_once_is_applied_once(drafts: Drafts) -> None:
    """Without the lock on the purchase both sessions would see a draft and add its stock."""
    purchase_id = drafts.purchase_ids[0]

    outcomes = _confirm_in_threads(drafts.user_id, [purchase_id, purchase_id])

    numbers = [outcome for outcome in outcomes if outcome.startswith("COMPRA-")]
    assert len(numbers) == 1
    assert [outcome for outcome in outcomes if outcome not in numbers] == ["PURCHASE_NOT_DRAFT"]
    with SessionLocal() as db:
        assert db.get_one(Product, drafts.product_ids[0]).current_stock == Decimal(5)
        entries = db.scalars(
            select(InventoryMovement).where(InventoryMovement.purchase_id == purchase_id)
        ).all()
        assert len(entries) == 1
