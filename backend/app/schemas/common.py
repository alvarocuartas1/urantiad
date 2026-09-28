from typing import Annotated

from fastapi import Query
from pydantic import BaseModel, ConfigDict, Field


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
