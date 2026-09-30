from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import AwareDatetime

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import AuditAction, AuditEntity, User
from app.schemas.audit import AuditLogResponse
from app.schemas.common import Page, PageParams, page_params
from app.services import audit_service

router = APIRouter(prefix="/audit-logs", tags=["audit"])

AuditReader = Annotated[User, require_permission(PermissionCode.AUDIT_READ)]


@router.get("", response_model=Page[AuditLogResponse])
def list_audit_logs(
    _: AuditReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    entity_type: AuditEntity | None = None,
    entity_id: Annotated[int | None, Query(gt=0)] = None,
    action: AuditAction | None = None,
    user_id: Annotated[int | None, Query(gt=0)] = None,
    search: Annotated[
        str | None,
        Query(max_length=100, description="Busca en el nombre de la entidad (SKU, consecutivo…)."),
    ] = None,
    date_from: Annotated[
        AwareDatetime | None, Query(description="Desde (incluido), con zona horaria.")
    ] = None,
    date_to: Annotated[
        AwareDatetime | None, Query(description="Hasta (excluido), con zona horaria.")
    ] = None,
) -> Page[AuditLogResponse]:
    """Registro de auditoría: quién cambió qué y cuándo, con valores anteriores y nuevos.
    Del más reciente al más antiguo. Es de solo lectura: ningún endpoint lo modifica."""
    logs, total = audit_service.list_logs(
        db,
        params,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        user_id=user_id,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )
    return Page(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        page=params.page,
        size=params.size,
    )
