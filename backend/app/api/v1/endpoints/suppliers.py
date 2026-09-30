from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import Supplier, SupplierProduct, User
from app.schemas.common import Page, PageParams, page_params
from app.schemas.supplier import (
    SupplierCreate,
    SupplierProductCreate,
    SupplierProductResponse,
    SupplierProductUpdate,
    SupplierResponse,
    SupplierUpdate,
)
from app.services import supplier_service

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

SuppliersReader = Annotated[User, require_permission(PermissionCode.SUPPLIERS_READ)]
SuppliersManager = Annotated[User, require_permission(PermissionCode.SUPPLIERS_MANAGE)]


@router.get("", response_model=Page[SupplierResponse])
def list_suppliers(
    _: SuppliersReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[
        str | None, Query(max_length=100, description="Busca en nombre, documento y contacto.")
    ] = None,
    is_active: bool | None = None,
) -> Page[SupplierResponse]:
    suppliers, total = supplier_service.list_suppliers(
        db, params, search=search, is_active=is_active
    )
    return Page(
        items=[SupplierResponse.model_validate(s) for s in suppliers],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(supplier_id: int, _: SuppliersReader, db: DbSession) -> Supplier:
    return supplier_service.get_supplier(db, supplier_id)


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(body: SupplierCreate, actor: SuppliersManager, db: DbSession) -> Supplier:
    return supplier_service.create_supplier(db, actor, body)


@router.patch("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int, body: SupplierUpdate, actor: SuppliersManager, db: DbSession
) -> Supplier:
    """Actualiza datos o estado. Los proveedores no se eliminan: se desactivan."""
    return supplier_service.update_supplier(db, actor, supplier_id, body)


@router.get("/{supplier_id}/products", response_model=Page[SupplierProductResponse])
def list_supplier_products(
    supplier_id: int,
    _: SuppliersReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[
        str | None,
        Query(
            max_length=100,
            description="Busca en nombre, SKU y código de barras del producto y en el código "
            "del proveedor.",
        ),
    ] = None,
) -> Page[SupplierProductResponse]:
    links, total = supplier_service.list_supplier_products(db, supplier_id, params, search=search)
    return Page(
        items=[SupplierProductResponse.model_validate(link) for link in links],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.post(
    "/{supplier_id}/products",
    response_model=SupplierProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_supplier_product(
    supplier_id: int, body: SupplierProductCreate, actor: SuppliersManager, db: DbSession
) -> SupplierProduct:
    """Asocia un producto físico activo al proveedor, con su precio de compra sin IVA."""
    return supplier_service.add_supplier_product(db, actor, supplier_id, body)


@router.patch("/{supplier_id}/products/{product_id}", response_model=SupplierProductResponse)
def update_supplier_product(
    supplier_id: int,
    product_id: int,
    body: SupplierProductUpdate,
    actor: SuppliersManager,
    db: DbSession,
) -> SupplierProduct:
    """Actualiza código, precio u observaciones. La fecha del precio cambia solo con el precio."""
    return supplier_service.update_supplier_product(db, actor, supplier_id, product_id, body)


@router.delete("/{supplier_id}/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_supplier_product(
    supplier_id: int, product_id: int, actor: SuppliersManager, db: DbSession
) -> None:
    supplier_service.remove_supplier_product(db, actor, supplier_id, product_id)
