from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import ProductType, StockStatus, User
from app.schemas.common import Page, PageParams, page_params
from app.schemas.product import (
    PriceHistoryResponse,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
)
from app.services import product_service

router = APIRouter(prefix="/products", tags=["products"])

ProductsReader = Annotated[User, require_permission(PermissionCode.PRODUCTS_READ)]
ProductsManager = Annotated[User, require_permission(PermissionCode.PRODUCTS_MANAGE)]


@router.get("", response_model=Page[ProductResponse])
def list_products(
    user: ProductsReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[
        str | None, Query(max_length=100, description="Busca en nombre, SKU y código de barras.")
    ] = None,
    category_id: Annotated[int | None, Query(gt=0)] = None,
    product_type: Annotated[ProductType | None, Query(alias="type")] = None,
    is_active: bool | None = None,
    stock_status: Annotated[
        StockStatus | None, Query(description="Nivel de stock (excluye servicios).")
    ] = None,
) -> Page[ProductResponse]:
    products, total = product_service.list_products(
        db,
        params,
        search=search,
        category_id=category_id,
        product_type=product_type,
        is_active=is_active,
        stock_status=stock_status,
    )
    return Page(
        items=[ProductResponse.for_user(p, user) for p in products],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, user: ProductsReader, db: DbSession) -> ProductResponse:
    return ProductResponse.for_user(product_service.get_product(db, product_id), user)


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(body: ProductCreate, actor: ProductsManager, db: DbSession) -> ProductResponse:
    """Crea un producto o servicio. El stock inicia en 0 y cambia solo con movimientos."""
    return ProductResponse.for_user(product_service.create_product(db, actor, body), actor)


@router.patch("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int, body: ProductUpdate, actor: ProductsManager, db: DbSession
) -> ProductResponse:
    """Actualiza datos, precio, niveles de stock o estado. Los cambios de precio se historizan."""
    product = product_service.update_product(db, actor, product_id, body)
    return ProductResponse.for_user(product, actor)


@router.get("/{product_id}/price-history", response_model=Page[PriceHistoryResponse])
def list_price_history(
    product_id: int,
    _: ProductsReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
) -> Page[PriceHistoryResponse]:
    """Precios de venta del producto, del más reciente al más antiguo."""
    entries, total = product_service.list_price_history(db, product_id, params)
    return Page(
        items=[PriceHistoryResponse.model_validate(e) for e in entries],
        total=total,
        page=params.page,
        size=params.size,
    )
