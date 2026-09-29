"""Customers. They are deactivated, never deleted.

The default customer ("Consumidor final") is seeded by the migration and is read-only.
"""

from collections.abc import Sequence

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import Customer
from app.schemas.common import PageParams
from app.schemas.customer import CustomerCreate, CustomerUpdate
from app.services.query import contains_pattern, paginate, violated_constraint

CONFLICTS_BY_CONSTRAINT = {
    "uq_customers_document_type_document_number": (
        "Ya existe un cliente con ese tipo y número de documento.",
        "CUSTOMER_DOCUMENT_TAKEN",
    ),
}


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        conflict = CONFLICTS_BY_CONSTRAINT.get(violated_constraint(exc) or "")
        if conflict is None:
            raise
        detail, code = conflict
        raise ConflictError(detail, code=code) from exc


def list_customers(
    db: Session, params: PageParams, *, search: str | None = None, is_active: bool | None = None
) -> tuple[Sequence[Customer], int]:
    stmt = select(Customer)
    if search and search.strip():
        pattern = contains_pattern(search.strip())
        stmt = stmt.where(
            or_(
                Customer.name.ilike(pattern),
                Customer.document_number.ilike(pattern),
                Customer.phone.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(Customer.is_active == is_active)
    # The default customer goes first: it is the one most often picked.
    stmt = stmt.order_by(Customer.is_default.desc(), Customer.name, Customer.id)
    return paginate(db, stmt, params)


def get_customer(db: Session, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise NotFoundError("El cliente no existe.", code="CUSTOMER_NOT_FOUND")
    return customer


def create_customer(db: Session, data: CustomerCreate) -> Customer:
    customer = Customer(**data.model_dump())
    db.add(customer)
    _commit(db)
    return customer


def update_customer(db: Session, customer_id: int, data: CustomerUpdate) -> Customer:
    customer = get_customer(db, customer_id)
    if customer.is_default:
        raise ConflictError(
            'El cliente "Consumidor final" no se puede modificar.',
            code="DEFAULT_CUSTOMER_READONLY",
        )
    for field, value in data.changes().items():
        setattr(customer, field, value)
    _commit(db)
    return customer
