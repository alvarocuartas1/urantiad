from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import Role, User
from app.schemas.role import RoleResponse
from app.services import user_service

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleResponse])
def list_roles(
    _: Annotated[User, require_permission(PermissionCode.ROLES_READ)], db: DbSession
) -> Sequence[Role]:
    """Roles del sistema con sus permisos (catálogo pequeño y fijo, sin paginación)."""
    return user_service.list_roles(db)
