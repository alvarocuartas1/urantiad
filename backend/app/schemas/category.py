from datetime import datetime
from typing import Annotated, ClassVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import ORMModel, PartialUpdate, optional_text

CategoryName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    Field(examples=["Bebidas"]),
]
CategoryDescription = Annotated[optional_text(255), Field(examples=["Gaseosas, jugos y agua."])]


class CategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: CategoryName
    description: CategoryDescription = None


class CategoryUpdate(PartialUpdate):
    nullable_fields: ClassVar[frozenset[str]] = frozenset({"description"})

    name: CategoryName | None = None
    description: CategoryDescription = None
    is_active: bool | None = None


class CategorySummary(ORMModel):
    id: int
    name: str = Field(examples=["Bebidas"])
    is_active: bool


class CategoryResponse(CategorySummary):
    description: str | None
    created_at: datetime
    updated_at: datetime
