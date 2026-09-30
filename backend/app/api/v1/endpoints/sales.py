from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import AwareDatetime

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import SaleStatus, User
from app.schemas.common import Page, PageParams, page_params
from app.schemas.sale import (
    SaleCancel,
    SaleCreate,
    SaleResponse,
    SaleSummary,
)
from app.services import sale_service

router = APIRouter(prefix="/sales", tags=["sales"])

SalesReader = Annotated[User, require_permission(PermissionCode.SALES_READ)]
SalesCreator = Annotated[User, require_permission(PermissionCode.SALES_CREATE)]
SalesCanceller = Annotated[User, require_permission(PermissionCode.SALES_CANCEL)]


@router.get("", response_model=Page[SaleSummary])
def list_sales(
    actor: SalesReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[
        str | None,
        Query(max_length=100, description="Busca en consecutivo y nombre o documento del cliente."),
    ] = None,
    sale_status: Annotated[SaleStatus | None, Query(alias="status")] = None,
    customer_id: Annotated[int | None, Query(gt=0)] = None,
    cash_session_id: Annotated[int | None, Query(gt=0)] = None,
    user_id: Annotated[
        int | None, Query(gt=0, description="Solo con `sales.read_all`; si no, se ignora.")
    ] = None,
    date_from: Annotated[
        AwareDatetime | None, Query(description="Desde (incluido), con zona horaria.")
    ] = None,
    date_to: Annotated[
        AwareDatetime | None, Query(description="Hasta (excluido), con zona horaria.")
    ] = None,
) -> Page[SaleSummary]:
    """Ventas, de la más reciente a la más antigua. Sin `sales.read_all` solo se ven las
    propias."""
    sales, total = sale_service.list_sales(
        db,
        actor,
        params,
        search=search,
        status=sale_status,
        customer_id=customer_id,
        cash_session_id=cash_session_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )
    return Page(
        items=[SaleSummary.model_validate(s) for s in sales],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{sale_id}", response_model=SaleResponse)
def get_sale(sale_id: int, actor: SalesReader, db: DbSession) -> SaleResponse:
    return SaleResponse.for_user(sale_service.get_sale(db, actor, sale_id), actor)


@router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
def create_sale(body: SaleCreate, actor: SalesCreator, db: DbSession) -> SaleResponse:
    """Registra una venta en la caja abierta del usuario. El precio y el costo salen del
    catálogo; los pagos deben sumar el total calculado en el servidor. En una sola
    transacción: consecutivo, líneas, pagos, salidas de inventario y entrada de caja por la
    parte en efectivo. Todo o nada."""
    return SaleResponse.for_user(sale_service.create_sale(db, actor, body), actor)


@router.post("/{sale_id}/cancel", response_model=SaleResponse)
def cancel_sale(
    sale_id: int, body: SaleCancel, actor: SalesCanceller, db: DbSession
) -> SaleResponse:
    """Anula una venta: devuelve las unidades al inventario y retira de la caja el efectivo
    cobrado (de la caja de la venta si sigue abierta; si no, de la caja abierta de quien
    anula). La venta no se borra."""
    return SaleResponse.for_user(sale_service.cancel_sale(db, actor, sale_id, body), actor)
