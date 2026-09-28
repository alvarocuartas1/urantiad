"""Query helpers shared by the services: search patterns, pagination and constraint errors."""

from collections.abc import Sequence
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.schemas.common import PageParams


def contains_pattern(value: str) -> str:
    """ILIKE pattern matching `value` anywhere, with `%` and `_` taken literally."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def paginate[T](db: Session, stmt: Select[Any], params: PageParams) -> tuple[Sequence[T], int]:
    """Run `stmt` for one page and return `(items, total)`. `stmt` must already be ordered."""
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.offset(params.offset).limit(params.size)).all()
    return items, total


def violated_constraint(exc: IntegrityError) -> str | None:
    """Name of the database constraint that caused `exc` (e.g. `uq_products_sku`)."""
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None)
