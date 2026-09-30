from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import User
from app.schemas.common import Page, PageParams, page_params
from app.schemas.user import PasswordReset, UserCreate, UserResponse, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])

UsersReader = Annotated[User, require_permission(PermissionCode.USERS_READ)]
UsersManager = Annotated[User, require_permission(PermissionCode.USERS_MANAGE)]


@router.get("", response_model=Page[UserResponse])
def list_users(
    _: UsersReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[
        str | None, Query(max_length=100, description="Busca en usuario y nombre.")
    ] = None,
    is_active: bool | None = None,
) -> Page[UserResponse]:
    users, total = user_service.list_users(db, params, search=search, is_active=is_active)
    return Page(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, _: UsersReader, db: DbSession) -> User:
    return user_service.get_user(db, user_id)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, actor: UsersManager, db: DbSession) -> User:
    return user_service.create_user(db, actor, body)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, body: UserUpdate, actor: UsersManager, db: DbSession) -> User:
    """Actualiza nombre, rol o estado. Desactivar un usuario cierra todas sus sesiones."""
    return user_service.update_user(db, actor, user_id, body)


@router.put("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(user_id: int, body: PasswordReset, actor: UsersManager, db: DbSession) -> None:
    """Restablece la contraseña de un usuario, lo desbloquea y cierra sus sesiones."""
    user_service.reset_password(db, actor, user_id, body.new_password)
