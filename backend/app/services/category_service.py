"""Product categories. A category with products can only be deactivated, never deleted."""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError
from app.models import Category, Product
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.schemas.common import PageParams
from app.services.query import contains_pattern, paginate, violated_constraint

NAME_UNIQUE_INDEX = "uq_categories_name_lower"
PRODUCTS_FK = "fk_products_category_id_categories"


def _name_taken() -> ConflictError:
    return ConflictError("Ya existe una categoría con ese nombre.", code="CATEGORY_NAME_TAKEN")


def _has_products() -> ConflictError:
    return ConflictError(
        "La categoría tiene productos asociados. Desactívela en lugar de eliminarla.",
        code="CATEGORY_HAS_PRODUCTS",
    )


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:  # concurrent insert or update with the same name
        db.rollback()
        if violated_constraint(exc) == NAME_UNIQUE_INDEX:
            raise _name_taken() from exc
        raise


def list_categories(
    db: Session, params: PageParams, *, search: str | None = None, is_active: bool | None = None
) -> tuple[Sequence[Category], int]:
    stmt = select(Category)
    if search and search.strip():
        stmt = stmt.where(Category.name.ilike(contains_pattern(search.strip())))
    if is_active is not None:
        stmt = stmt.where(Category.is_active == is_active)
    return paginate(db, stmt.order_by(Category.name, Category.id), params)


def get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise NotFoundError("La categoría no existe.", code="CATEGORY_NOT_FOUND")
    return category


def get_active_category(db: Session, category_id: int) -> Category:
    """Category that a product can be assigned to (422 when missing or inactive)."""
    category = db.get(Category, category_id)
    if category is None:
        raise AppError(
            "La categoría seleccionada no existe.", code="CATEGORY_NOT_FOUND", status_code=422
        )
    if not category.is_active:
        raise AppError(
            "La categoría seleccionada está inactiva.", code="CATEGORY_INACTIVE", status_code=422
        )
    return category


def create_category(db: Session, data: CategoryCreate) -> Category:
    category = Category(name=data.name, description=data.description)
    db.add(category)
    _commit(db)
    return category


def update_category(db: Session, category_id: int, data: CategoryUpdate) -> Category:
    category = get_category(db, category_id)
    for field, value in data.changes().items():
        setattr(category, field, value)
    _commit(db)
    return category


def delete_category(db: Session, category_id: int) -> None:
    category = get_category(db, category_id)
    if db.scalar(select(Product.id).where(Product.category_id == category.id).limit(1)):
        raise _has_products()
    db.delete(category)
    try:
        db.commit()
    except IntegrityError as exc:  # a product was assigned concurrently
        db.rollback()
        if violated_constraint(exc) == PRODUCTS_FK:
            raise _has_products() from exc
        raise
