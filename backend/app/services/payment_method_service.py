"""Payment methods: a short catalog the administrator maintains.

Deactivating a method only hides it from new sales; sales already paid with it keep it.
The cash method is the only one that moves the drawer, so it can never be deactivated.
"""

import re
import unicodedata
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import AuditAction, PaymentMethod, User
from app.schemas.payment_method import PaymentMethodCreate, PaymentMethodUpdate
from app.services import audit_service
from app.services.query import violated_constraint

NAME_INDEX = "uq_payment_methods_name_lower"
CODE_MAX_LENGTH = 30
AUDITED_FIELDS = ("name", "sort_order", "is_active")


def list_payment_methods(db: Session, *, include_inactive: bool = False) -> Sequence[PaymentMethod]:
    """Payment methods in display order (a short catalog: not paginated)."""
    stmt = select(PaymentMethod).order_by(PaymentMethod.sort_order, PaymentMethod.id)
    if not include_inactive:
        stmt = stmt.where(PaymentMethod.is_active.is_(True))
    return db.scalars(stmt).all()


def get_payment_method(db: Session, method_id: int) -> PaymentMethod:
    method = db.get(PaymentMethod, method_id)
    if method is None:
        raise NotFoundError("El método de pago no existe.", code="PAYMENT_METHOD_NOT_FOUND")
    return method


def slugify(name: str) -> str:
    """ASCII identifier from a name: "Bre-B Pagos" → "bre_b_pagos"."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")
    return slug[:CODE_MAX_LENGTH].strip("_") or "method"


def _unique_code(db: Session, name: str) -> str:
    """`slugify(name)`, with a numeric suffix when another method already uses it."""
    base = slugify(name)
    taken = set(
        db.scalars(
            select(PaymentMethod.code).where(PaymentMethod.code.startswith(base, autoescape=True))
        )
    )
    code, suffix = base, 2
    while code in taken:
        ending = f"_{suffix}"
        code = base[: CODE_MAX_LENGTH - len(ending)] + ending
        suffix += 1
    return code


def _flush(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if violated_constraint(exc) == NAME_INDEX:
            raise ConflictError(
                "Ya existe un método de pago con ese nombre.", code="PAYMENT_METHOD_NAME_TAKEN"
            ) from exc
        raise


def create_payment_method(db: Session, actor: User, data: PaymentMethodCreate) -> PaymentMethod:
    method = PaymentMethod(
        code=_unique_code(db, data.name), name=data.name, sort_order=data.sort_order
    )
    db.add(method)
    _flush(db)
    audit_service.record(
        db,
        actor,
        AuditAction.PAYMENT_METHOD_CREATE,
        method.id,
        method.name,
        new=audit_service.snapshot(method, ("code", *AUDITED_FIELDS)),
    )
    db.commit()
    return method


def update_payment_method(
    db: Session, actor: User, method_id: int, data: PaymentMethodUpdate
) -> PaymentMethod:
    method = get_payment_method(db, method_id)
    changes = data.changes()
    if method.is_cash and changes.get("is_active") is False:
        raise ConflictError(
            "El efectivo no se puede desactivar: es el método que mueve la caja.",
            code="CASH_METHOD_REQUIRED",
        )
    before = audit_service.snapshot(method, AUDITED_FIELDS)
    for field, value in changes.items():
        setattr(method, field, value)
    _flush(db)
    audit_service.record_changes(
        db,
        actor,
        AuditAction.PAYMENT_METHOD_UPDATE,
        method.id,
        method.name,
        before,
        audit_service.snapshot(method, AUDITED_FIELDS),
    )
    db.commit()
    return method
