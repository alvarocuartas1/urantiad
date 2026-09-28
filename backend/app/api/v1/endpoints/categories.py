from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import Category, User
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate
from app.schemas.common import Page, PageParams, page_params
from app.services import category_service

router = APIRouter(prefix="/categories", tags=["categories"])

ProductsReader = Annotated[User, require_permission(PermissionCode.PRODUCTS_READ)]
ProductsManager = Annotated[User, require_permission(PermissionCode.PRODUCTS_MANAGE)]


@router.get("", response_model=Page[CategoryResponse])
def list_categories(
    _: ProductsReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[str | None, Query(max_length=100, description="Busca en el nombre.")] = None,
    is_active: bool | None = None,
) -> Page[CategoryResponse]:
    categories, total = category_service.list_categories(
        db, params, search=search, is_active=is_active
    )
    return Page(
        items=[CategoryResponse.model_validate(c) for c in categories],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int, _: ProductsReader, db: DbSession) -> Category:
    return category_service.get_category(db, category_id)


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, _: ProductsManager, db: DbSession) -> Category:
    return category_service.create_category(db, body)


@router.patch("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int, body: CategoryUpdate, _: ProductsManager, db: DbSession
) -> Category:
    """Actualiza nombre, descripción o estado. Los campos omitidos no cambian."""
    return category_service.update_category(db, category_id, body)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, _: ProductsManager, db: DbSession) -> None:
    """Elimina una categoría sin productos. Si tiene productos, debe desactivarse (409)."""
    category_service.delete_category(db, category_id)
