from typing import Annotated, Any, ClassVar, Self

from fastapi import Query
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    """Paginated list response used by every listing endpoint."""

    items: list[T]
    total: int = Field(examples=[42])
    page: int = Field(examples=[1])
    size: int = Field(examples=[20])


class PageParams(BaseModel):
    page: int = 1
    size: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


def page_params(
    page: Annotated[int, Query(ge=1, description="Número de página (desde 1).")] = 1,
    size: Annotated[int, Query(ge=1, le=100, description="Elementos por página.")] = 20,
) -> PageParams:
    return PageParams(page=page, size=size)


def _strip_to_none(value: object) -> object:
    if isinstance(value, str):
        return value.strip() or None
    return value


def optional_text(max_length: int, *, pattern: str | None = None) -> Any:
    """Optional text: surrounding spaces are removed and an empty string becomes NULL."""
    text = Annotated[str, StringConstraints(max_length=max_length, pattern=pattern)]
    return Annotated[text | None, BeforeValidator(_strip_to_none)]


class PartialUpdate(BaseModel):
    """PATCH body: omitted fields are left unchanged; `null` is only valid for nullable ones."""

    model_config = ConfigDict(extra="forbid")
    nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def _reject_null_for_required_fields(self) -> Self:
        for name in self.model_fields_set - self.nullable_fields:
            if getattr(self, name) is None:
                raise ValueError(f"{name}: no puede ser nulo")
        return self

    def changes(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)
