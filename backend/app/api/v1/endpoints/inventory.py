from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import AwareDatetime

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import MovementType, StockStatus, User
from app.schemas.common import Page, PageParams, page_params
from app.schemas.inventory import (
    AdjustmentCreate,
    AdjustmentResponse,
    MovementResponse,
    ReplenishmentItem,
)
from app.schemas.product import ProductResponse
from app.services import inventory_service

router = APIRouter(prefix="/inventory", tags=["inventory"])

InventoryReader = Annotated[User, require_permission(PermissionCode.INVENTORY_READ)]
InventoryAdjuster = Annotated[User, require_permission(PermissionCode.INVENTORY_ADJUST)]


@router.post("/adjustments", response_model=AdjustmentResponse, status_code=status.HTTP_201_CREATED)
def create_adjustment(
    body: AdjustmentCreate, actor: InventoryAdjuster, db: DbSession
) -> AdjustmentResponse:
    """Registra una entrada o salida manual con motivo obligatorio (conteos, mermas, carga
    inicial). Las salidas no pueden dejar el stock negativo salvo que se habilite."""
    movement = inventory_service.create_adjustment(db, actor, body)
    return AdjustmentResponse(
        movement=MovementResponse.for_user(movement, actor),
        product=ProductResponse.for_user(movement.product, actor),
    )


@router.get("/movements", response_model=Page[MovementResponse])
def list_movements(
    user: InventoryReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    product_id: Annotated[int | None, Query(gt=0)] = None,
    movement_type: MovementType | None = None,
    user_id: Annotated[int | None, Query(gt=0)] = None,
    date_from: Annotated[
        AwareDatetime | None, Query(description="Desde (incluido), con zona horaria.")
    ] = None,
    date_to: Annotated[
        AwareDatetime | None, Query(description="Hasta (excluido), con zona horaria.")
    ] = None,
) -> Page[MovementResponse]:
    """Historial de movimientos, del más reciente al más antiguo."""
    movements, total = inventory_service.list_movements(
        db,
        params,
        product_id=product_id,
        movement_type=movement_type,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )
    return Page(
        items=[MovementResponse.for_user(m, user) for m in movements],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/replenishment", response_model=Page[ReplenishmentItem])
def list_replenishment(
    _: InventoryReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[
        str | None, Query(max_length=100, description="Busca en nombre, SKU y código de barras.")
    ] = None,
    category_id: Annotated[int | None, Query(gt=0)] = None,
    stock_status: StockStatus | None = None,
) -> Page[ReplenishmentItem]:
    """Productos que requieren reposición (stock ≤ punto de reorden), los más urgentes
    primero, con la cantidad sugerida de compra."""
    products, total = inventory_service.list_replenishment(
        db, params, search=search, category_id=category_id, stock_status=stock_status
    )
    return Page(
        items=[ReplenishmentItem.model_validate(p) for p in products],
        total=total,
        page=params.page,
        size=params.size,
    )
