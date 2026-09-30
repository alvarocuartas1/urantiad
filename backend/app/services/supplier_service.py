"""Suppliers and the products each one sells.

Suppliers are deactivated, never deleted. A supplier-product link is catalog data (latest
purchase price and supplier code), so it can be removed; purchase history lives in purchases.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Select, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, ConflictError, NotFoundError
from app.models import AuditAction, Product, ProductType, Supplier, SupplierProduct, User
from app.schemas.common import PageParams
from app.schemas.supplier import (
    SupplierCreate,
    SupplierProductCreate,
    SupplierProductUpdate,
    SupplierUpdate,
)
from app.services import audit_service, product_service
from app.services.product_service import get_product, matches_search
from app.services.query import contains_pattern, paginate, violated_constraint

CONFLICTS_BY_CONSTRAINT = {
    "uq_suppliers_document_type_document_number": (
        "Ya existe un proveedor con ese tipo y número de documento.",
        "SUPPLIER_DOCUMENT_TAKEN",
    ),
    "uq_supplier_products_supplier_id_product_id": (
        "El producto ya está asociado a este proveedor.",
        "SUPPLIER_PRODUCT_EXISTS",
    ),
}


AUDITED_FIELDS = (
    "document_type",
    "document_number",
    "name",
    "contact_name",
    "phone",
    "email",
    "address",
    "city",
    "notes",
    "is_active",
)
AUDITED_LINK_FIELDS = ("supplier_sku", "purchase_price", "notes")


def _flush(db: Session) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        conflict = CONFLICTS_BY_CONSTRAINT.get(violated_constraint(exc) or "")
        if conflict is None:
            raise
        detail, code = conflict
        raise ConflictError(detail, code=code) from exc


# --- Suppliers -----------------------------------------------------------------------


def list_suppliers(
    db: Session, params: PageParams, *, search: str | None = None, is_active: bool | None = None
) -> tuple[Sequence[Supplier], int]:
    stmt = select(Supplier)
    if search and search.strip():
        pattern = contains_pattern(search.strip())
        stmt = stmt.where(
            or_(
                Supplier.name.ilike(pattern),
                Supplier.document_number.ilike(pattern),
                Supplier.contact_name.ilike(pattern),
            )
        )
    if is_active is not None:
        stmt = stmt.where(Supplier.is_active == is_active)
    return paginate(db, stmt.order_by(Supplier.name, Supplier.id), params)


def get_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise NotFoundError("El proveedor no existe.", code="SUPPLIER_NOT_FOUND")
    return supplier


def create_supplier(db: Session, actor: User, data: SupplierCreate) -> Supplier:
    supplier = Supplier(**data.model_dump())
    db.add(supplier)
    _flush(db)
    audit_service.record(
        db,
        actor,
        AuditAction.SUPPLIER_CREATE,
        supplier.id,
        supplier.name,
        new=audit_service.snapshot(supplier, AUDITED_FIELDS),
    )
    db.commit()
    return supplier


def update_supplier(db: Session, actor: User, supplier_id: int, data: SupplierUpdate) -> Supplier:
    supplier = get_supplier(db, supplier_id)
    before = audit_service.snapshot(supplier, AUDITED_FIELDS)
    for field, value in data.changes().items():
        setattr(supplier, field, value)
    _flush(db)
    audit_service.record_changes(
        db,
        actor,
        AuditAction.SUPPLIER_UPDATE,
        supplier.id,
        supplier.name,
        before,
        audit_service.snapshot(supplier, AUDITED_FIELDS),
    )
    db.commit()
    return supplier


# --- Products by supplier ------------------------------------------------------------


def _with_details(stmt: Select[Any]) -> Select[Any]:
    return stmt.options(
        selectinload(SupplierProduct.supplier), selectinload(SupplierProduct.product)
    )


def purchasable_product(db: Session, product_id: int) -> Product:
    """Product that can be bought from a supplier (422 when missing, inactive or a service)."""
    product = db.get(Product, product_id)
    if product is None:
        raise AppError(
            "El producto seleccionado no existe.", code="PRODUCT_NOT_FOUND", status_code=422
        )
    if not product.is_active:
        raise AppError(
            "El producto seleccionado está inactivo.", code="PRODUCT_INACTIVE", status_code=422
        )
    if product.type == ProductType.SERVICE:
        raise AppError(
            "Los servicios no se compran a proveedores.",
            code="PRODUCT_NOT_PURCHASABLE",
            status_code=422,
        )
    return product


def list_supplier_products(
    db: Session, supplier_id: int, params: PageParams, *, search: str | None = None
) -> tuple[Sequence[SupplierProduct], int]:
    get_supplier(db, supplier_id)
    stmt = (
        select(SupplierProduct)
        .join(SupplierProduct.product)
        .where(SupplierProduct.supplier_id == supplier_id)
    )
    if search and search.strip():
        term = search.strip()
        stmt = stmt.where(
            or_(matches_search(term), SupplierProduct.supplier_sku.ilike(contains_pattern(term)))
        )
    stmt = _with_details(stmt).order_by(Product.name, SupplierProduct.id)
    return paginate(db, stmt, params)


def get_supplier_product(db: Session, supplier_id: int, product_id: int) -> SupplierProduct:
    link = db.scalar(
        _with_details(select(SupplierProduct)).where(
            SupplierProduct.supplier_id == supplier_id, SupplierProduct.product_id == product_id
        )
    )
    if link is None:
        get_supplier(db, supplier_id)  # a missing supplier is reported as such
        raise NotFoundError(
            "El producto no está asociado a este proveedor.", code="SUPPLIER_PRODUCT_NOT_FOUND"
        )
    return link


def _link_product(link: SupplierProduct) -> audit_service.Values:
    return {"product": product_service.audit_label(link.product)}


def add_supplier_product(
    db: Session, actor: User, supplier_id: int, data: SupplierProductCreate
) -> SupplierProduct:
    supplier = get_supplier(db, supplier_id)
    if not supplier.is_active:
        raise ConflictError(
            "El proveedor está inactivo. Actívelo para asociarle productos.",
            code="SUPPLIER_INACTIVE",
        )
    link = SupplierProduct(
        supplier=supplier,
        product=purchasable_product(db, data.product_id),
        supplier_sku=data.supplier_sku,
        purchase_price=data.purchase_price,
        price_updated_at=datetime.now(UTC) if data.purchase_price is not None else None,
        notes=data.notes,
    )
    db.add(link)
    _flush(db)
    audit_service.record(
        db,
        actor,
        AuditAction.SUPPLIER_PRODUCT_ADD,
        supplier.id,
        supplier.name,
        new=_link_product(link) | audit_service.snapshot(link, AUDITED_LINK_FIELDS),
    )
    db.commit()
    return link


def update_supplier_product(
    db: Session, actor: User, supplier_id: int, product_id: int, data: SupplierProductUpdate
) -> SupplierProduct:
    link = get_supplier_product(db, supplier_id, product_id)
    before = audit_service.snapshot(link, AUDITED_LINK_FIELDS)
    changes = data.changes()
    if "purchase_price" in changes and changes["purchase_price"] != link.purchase_price:
        # The date tracks the price itself, so it changes only when the price does.
        link.price_updated_at = datetime.now(UTC) if changes["purchase_price"] is not None else None
    for field, value in changes.items():
        setattr(link, field, value)
    _flush(db)
    old, new = audit_service.changes(before, audit_service.snapshot(link, AUDITED_LINK_FIELDS))
    if new:
        # The product is kept on both sides so the record says which link changed.
        audit_service.record(
            db,
            actor,
            AuditAction.SUPPLIER_PRODUCT_UPDATE,
            link.supplier.id,
            link.supplier.name,
            old=_link_product(link) | old,
            new=_link_product(link) | new,
        )
    db.commit()
    return link


def remove_supplier_product(db: Session, actor: User, supplier_id: int, product_id: int) -> None:
    link = get_supplier_product(db, supplier_id, product_id)
    audit_service.record(
        db,
        actor,
        AuditAction.SUPPLIER_PRODUCT_REMOVE,
        link.supplier.id,
        link.supplier.name,
        old=_link_product(link) | audit_service.snapshot(link, AUDITED_LINK_FIELDS),
    )
    db.delete(link)
    db.commit()


def list_product_suppliers(db: Session, product_id: int) -> Sequence[SupplierProduct]:
    """Suppliers of a product, most recently priced first (a product has only a few)."""
    get_product(db, product_id)
    stmt = (
        _with_details(select(SupplierProduct))
        .join(SupplierProduct.supplier)
        .where(SupplierProduct.product_id == product_id)
        .order_by(
            SupplierProduct.price_updated_at.desc().nulls_last(), Supplier.name, SupplierProduct.id
        )
    )
    return db.scalars(stmt).all()
