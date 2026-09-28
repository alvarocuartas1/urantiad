from sqlalchemy import Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))


# Names are unique regardless of case ("Bebidas" and "bebidas" are the same category).
Index("uq_categories_name_lower", func.lower(Category.name), unique=True)
