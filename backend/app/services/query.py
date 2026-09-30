"""Query helpers shared by the services: search patterns, pagination, date ranges and
constraint errors."""

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, Row, Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.schemas.common import PageParams


def contains_pattern(value: str) -> str:
    """ILIKE pattern matching `value` anywhere, with `%` and `_` taken literally."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _count(db: Session, stmt: Select[Any]) -> int:
    return db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0


def paginate[T](db: Session, stmt: Select[Any], params: PageParams) -> tuple[Sequence[T], int]:
    """Run `stmt` for one page and return `(items, total)`. `stmt` must already be ordered."""
    items = db.scalars(stmt.offset(params.offset).limit(params.size)).all()
    return items, _count(db, stmt)


def paginate_rows(
    db: Session, stmt: Select[Any], params: PageParams
) -> tuple[Sequence[Row[Any]], int]:
    """Like `paginate`, for statements with several columns (e.g. grouped reports)."""
    rows = db.execute(stmt.offset(params.offset).limit(params.size)).all()
    return rows, _count(db, stmt)


def filter_date_range(
    stmt: Select[Any],
    column: ColumnElement[datetime],
    date_from: datetime | None,
    date_to: datetime | None,
) -> Select[Any]:
    """Restrict `stmt` to `date_from <= column < date_to` (either bound may be omitted)."""
    if date_from is not None and date_to is not None and date_from >= date_to:
        raise AppError(
            "La fecha inicial debe ser anterior a la fecha final.",
            code="INVALID_DATE_RANGE",
            status_code=422,
        )
    if date_from is not None:
        stmt = stmt.where(column >= date_from)
    if date_to is not None:
        stmt = stmt.where(column < date_to)
    return stmt


def violated_constraint(exc: IntegrityError) -> str | None:
    """Name of the database constraint that caused `exc` (e.g. `uq_products_sku`)."""
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None)
