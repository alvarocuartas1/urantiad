from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import AwareDatetime

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import Purchase, PurchaseStatus, User
from app.schemas.common import Page, PageParams, page_params
from app.schemas.purchase import PurchaseCancel, PurchaseInput, PurchaseResponse, PurchaseSummary
from app.services import purchase_service

router = APIRouter(prefix="/purchases", tags=["purchases"])

PurchasesReader = Annotated[User, require_permission(PermissionCode.PURCHASES_READ)]
PurchasesManager = Annotated[User, require_permission(PermissionCode.PURCHASES_MANAGE)]
PurchasesCanceller = Annotated[User, require_permission(PermissionCode.PURCHASES_CANCEL)]


@router.get("", response_model=Page[PurchaseSummary])
def list_purchases(
    _: PurchasesReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[
        str | None,
        Query(max_length=100, description="Busca en consecutivo, factura y nombre del proveedor."),
    ] = None,
    supplier_id: Annotated[int | None, Query(gt=0)] = None,
    purchase_status: Annotated[PurchaseStatus | None, Query(alias="status")] = None,
    date_from: Annotated[
        AwareDatetime | None,
        Query(description="Desde (incluido), con zona horaria. Fecha de confirmación."),
    ] = None,
    date_to: Annotated[
        AwareDatetime | None, Query(description="Hasta (excluido), con zona horaria.")
    ] = None,
) -> Page[PurchaseSummary]:
    """Compras, de la más reciente a la más antigua. Los borradores se fechan por su creación."""
    purchases, total = purchase_service.list_purchases(
        db,
        params,
        search=search,
        supplier_id=supplier_id,
        status=purchase_status,
        date_from=date_from,
        date_to=date_to,
    )
    return Page(
        items=[PurchaseSummary.model_validate(p) for p in purchases],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{purchase_id}", response_model=PurchaseResponse)
def get_purchase(purchase_id: int, _: PurchasesReader, db: DbSession) -> Purchase:
    return purchase_service.get_purchase(db, purchase_id)


@router.post("", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
def create_purchase(body: PurchaseInput, actor: PurchasesManager, db: DbSession) -> Purchase:
    """Crea una compra en borrador. Los totales se calculan en el servidor; el borrador no
    afecta el inventario ni consume consecutivo."""
    return purchase_service.create_purchase(db, actor, body)


@router.put("/{purchase_id}", response_model=PurchaseResponse)
def update_purchase(
    purchase_id: int, body: PurchaseInput, _: PurchasesManager, db: DbSession
) -> Purchase:
    """Reemplaza la cabecera y las líneas de un borrador."""
    return purchase_service.update_purchase(db, purchase_id, body)


@router.delete("/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purchase(purchase_id: int, _: PurchasesManager, db: DbSession) -> None:
    """Descarta un borrador. Las compras confirmadas no se eliminan: se anulan."""
    purchase_service.delete_purchase(db, purchase_id)


@router.post("/{purchase_id}/confirm", response_model=PurchaseResponse)
def confirm_purchase(purchase_id: int, actor: PurchasesManager, db: DbSession) -> Purchase:
    """Asigna el consecutivo, registra las entradas de inventario al costo neto (costo
    promedio ponderado y último costo) y actualiza el precio del proveedor. Todo o nada."""
    return purchase_service.confirm_purchase(db, actor, purchase_id)


@router.post("/{purchase_id}/cancel", response_model=PurchaseResponse)
def cancel_purchase(
    purchase_id: int, body: PurchaseCancel, actor: PurchasesCanceller, db: DbSession
) -> Purchase:
    """Anula una compra confirmada con movimientos inversos de inventario. Falla sin cambios si
    las unidades ya no están en stock."""
    return purchase_service.cancel_purchase(db, actor, purchase_id, body)
