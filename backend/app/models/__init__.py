# Import every model module here so Alembic autogenerate sees all tables.
from app.models.base import Base

__all__ = ["Base"]
