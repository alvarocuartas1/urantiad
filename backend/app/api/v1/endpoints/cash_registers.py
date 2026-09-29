from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import CashRegister, User
from app.schemas.cash import CashRegisterCreate, CashRegisterResponse, CashRegisterUpdate
from app.schemas.common import Page, PageParams, page_params
from app.services import cash_service

router = APIRouter(prefix="/cash-registers", tags=["cash"])

RegistersReader = Annotated[User, require_permission(PermissionCode.CASH_REGISTERS_READ)]
RegistersManager = Annotated[User, require_permission(PermissionCode.CASH_REGISTERS_MANAGE)]


@router.get("", response_model=Page[CashRegisterResponse])
def list_registers(
    _: RegistersReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[str | None, Query(max_length=100, description="Busca en el nombre.")] = None,
    is_active: bool | None = None,
) -> Page[CashRegisterResponse]:
    """Cajas por nombre, con la apertura activa de cada una (quién la tiene abierta)."""
    registers, total = cash_service.list_registers(db, params, search=search, is_active=is_active)
    return Page(
        items=[CashRegisterResponse.model_validate(r) for r in registers],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{register_id}", response_model=CashRegisterResponse)
def get_register(register_id: int, _: RegistersReader, db: DbSession) -> CashRegister:
    return cash_service.get_register(db, register_id)


@router.post("", response_model=CashRegisterResponse, status_code=status.HTTP_201_CREATED)
def create_register(body: CashRegisterCreate, _: RegistersManager, db: DbSession) -> CashRegister:
    return cash_service.create_register(db, body)


@router.patch("/{register_id}", response_model=CashRegisterResponse)
def update_register(
    register_id: int, body: CashRegisterUpdate, _: RegistersManager, db: DbSession
) -> CashRegister:
    """Actualiza nombre, descripción o estado. Una caja con apertura activa no se puede
    desactivar (409). Las cajas no se eliminan."""
    return cash_service.update_register(db, register_id, body)
