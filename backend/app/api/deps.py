"""Shared FastAPI dependencies: database session, current user and permission checks."""

from typing import Annotated, Any

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.permissions import PermissionCode
from app.core.security import decode_access_token
from app.models import User
from app.services import auth_service

DbSession = Annotated[Session, Depends(get_db)]

bearer_scheme = HTTPBearer(
    auto_error=False, description="Access token obtenido en `POST /api/v1/auth/login`."
)


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("No autenticado.", code="NOT_AUTHENTICATED")
    user_id = decode_access_token(credentials.credentials)
    # The user is reloaded on every request, so deactivation takes effect immediately.
    user = auth_service.get_active_user(db, user_id) if user_id is not None else None
    if user is None:
        raise UnauthorizedError(
            "Sesión inválida o expirada. Inicie sesión nuevamente.", code="TOKEN_INVALID"
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(permission: PermissionCode) -> Any:
    """Dependency that returns the current user if their role grants `permission`."""

    def check_permission(user: CurrentUser) -> User:
        if permission not in user.permission_codes:
            raise ForbiddenError("No tiene permisos para realizar esta acción.")
        return user

    return Depends(check_permission)
