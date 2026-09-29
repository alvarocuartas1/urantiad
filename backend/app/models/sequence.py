from sqlalchemy import CheckConstraint, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DocumentSequence(Base):
    """Consecutive numbering of a document type (`COMPRA-000001`), without gaps.

    Rows are seeded by migrations. The row is locked while a number is taken, inside the
    same transaction that saves the document, so a rolled back document releases its number.
    """

    __tablename__ = "document_sequences"
    __table_args__ = (CheckConstraint("last_value >= 0", name="last_value_non_negative"),)

    name: Mapped[str] = mapped_column(String(30), primary_key=True)
    prefix: Mapped[str] = mapped_column(String(10))
    last_value: Mapped[int] = mapped_column(server_default=text("0"))
