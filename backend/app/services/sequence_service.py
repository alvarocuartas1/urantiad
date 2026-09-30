"""Consecutive document numbers (`COMPRA-000001`) without gaps."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DocumentSequence

PURCHASE_SEQUENCE = "purchase"
SALE_SEQUENCE = "sale"


def next_number(db: Session, name: str) -> str:
    """Take the next number of sequence `name`, without committing.

    The row stays locked until the caller's transaction ends, so concurrent documents wait
    for each other and a rolled back document gives its number back.
    """
    sequence = db.scalars(
        select(DocumentSequence)
        .where(DocumentSequence.name == name)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    sequence.last_value += 1
    return f"{sequence.prefix}-{sequence.last_value:06d}"
