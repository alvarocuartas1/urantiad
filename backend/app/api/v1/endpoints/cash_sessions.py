from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import AwareDatetime
from sqlalchemy.orm import Session

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import CashSession, CashSessionStatus, User
from app.schemas.cash import (
    CashMovementCreate,
    CashMovementResponse,
    CashMovementResult,
    CashSessionOpen,
    CashSessionResponse,
)
from app.schemas.common import Page, PageParams, page_params
from app.services import cash_service

router = APIRouter(prefix="/cash-sessions", tags=["cash"])

CashOperator = Annotated[User, require_permission(PermissionCode.CASH_OPERATE)]


def _session_response(db: Session, session: CashSession) -> CashSessionResponse:
    return CashSessionResponse.build(session, cash_service.summary(db, session))


@router.post("", response_model=CashSessionResponse, status_code=status.HTTP_201_CREATED)
def open_session(body: CashSessionOpen, actor: CashOperator, db: DbSession) -> CashSessionResponse:
    """Abre una caja con su dinero inicial. Una caja y un usuario solo pueden tener una
    apertura activa a la vez (409)."""
    return _session_response(db, cash_service.open_session(db, actor, body))


@router.get("/current", response_model=CashSessionResponse | None)
def get_current_session(actor: CashOperator, db: DbSession) -> CashSessionResponse | None:
    """Apertura activa del usuario con su resumen, o `null` si no tiene caja abierta."""
    session = cash_service.get_open_session_for_user(db, actor)
    return _session_response(db, session) if session is not None else None


@router.get("", response_model=Page[CashSessionResponse])
def list_sessions(
    actor: CashOperator,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    cash_register_id: Annotated[int | None, Query(gt=0)] = None,
    user_id: Annotated[
        int | None, Query(gt=0, description="Solo con `cash.supervise`; si no, se ignora.")
    ] = None,
    status: CashSessionStatus | None = None,
    date_from: Annotated[
        AwareDatetime | None, Query(description="Abiertas desde (incluido), con zona horaria.")
    ] = None,
    date_to: Annotated[
        AwareDatetime | None, Query(description="Abiertas hasta (excluido), con zona horaria.")
    ] = None,
) -> Page[CashSessionResponse]:
    """Historial de aperturas, de la más reciente a la más antigua. Sin `cash.supervise`
    solo se ven las propias."""
    sessions, total = cash_service.list_sessions(
        db,
        actor,
        params,
        cash_register_id=cash_register_id,
        user_id=user_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )
    summaries = cash_service.summaries(db, sessions)
    return Page(
        items=[CashSessionResponse.build(s, summaries[s.id]) for s in sessions],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{session_id}", response_model=CashSessionResponse)
def get_session(session_id: int, actor: CashOperator, db: DbSession) -> CashSessionResponse:
    return _session_response(db, cash_service.get_session(db, actor, session_id))


@router.get("/{session_id}/movements", response_model=Page[CashMovementResponse])
def list_movements(
    session_id: int,
    actor: CashOperator,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
) -> Page[CashMovementResponse]:
    """Movimientos de la apertura, del más reciente al más antiguo."""
    movements, total = cash_service.list_movements(db, actor, session_id, params)
    return Page(
        items=[CashMovementResponse.model_validate(m) for m in movements],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.post(
    "/{session_id}/movements",
    response_model=CashMovementResult,
    status_code=status.HTTP_201_CREATED,
)
def create_movement(
    session_id: int, body: CashMovementCreate, actor: CashOperator, db: DbSession
) -> CashMovementResult:
    """Registra un ingreso o retiro de efectivo en la propia apertura activa. Un retiro no
    puede superar el efectivo esperado (409 `INSUFFICIENT_CASH`)."""
    movement = cash_service.create_movement(db, actor, session_id, body)
    session = cash_service.get_session(db, actor, session_id)
    return CashMovementResult(
        movement=CashMovementResponse.model_validate(movement),
        session=_session_response(db, session),
    )
