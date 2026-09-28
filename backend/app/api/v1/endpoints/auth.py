from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import UnauthorizedError
from app.schemas.auth import (
    ChangePasswordRequest,
    CurrentUserResponse,
    LoginRequest,
    TokenResponse,
)
from app.services import auth_service
from app.services.auth_service import AuthSession

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"
# The cookie is only sent to the auth endpoints, never to the rest of the API.
REFRESH_COOKIE_PATH = "/api/v1/auth"

RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME, include_in_schema=False)]


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=settings.refresh_token_expire_hours * 3600,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _session_response(response: Response, session: AuthSession) -> TokenResponse:
    _set_refresh_cookie(response, session.refresh_token)
    return TokenResponse(
        access_token=session.access_token,
        expires_in=session.expires_in,
        user=CurrentUserResponse.from_user(session.user),
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, db: DbSession) -> TokenResponse:
    """Inicia sesión. Devuelve el access token y deja el refresh token en una cookie httpOnly."""
    session = auth_service.login(db, body.username, body.password)
    return _session_response(response, session)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response, db: DbSession, refresh_token: RefreshCookie = None
) -> TokenResponse:
    """Renueva el access token usando la cookie de sesión (el refresh token se rota)."""
    if not refresh_token:
        raise UnauthorizedError("No hay una sesión activa.", code="SESSION_EXPIRED")
    session = auth_service.refresh_session(db, refresh_token)
    return _session_response(response, session)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, db: DbSession, refresh_token: RefreshCookie = None) -> None:
    """Cierra la sesión actual."""
    auth_service.logout(db, refresh_token)
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)


@router.get("/me", response_model=CurrentUserResponse)
def me(user: CurrentUser) -> CurrentUserResponse:
    """Usuario autenticado, con su rol y permisos."""
    return CurrentUserResponse.from_user(user)


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_own_password(
    body: ChangePasswordRequest,
    user: CurrentUser,
    db: DbSession,
    refresh_token: RefreshCookie = None,
) -> None:
    """Cambia la contraseña propia. Cierra las sesiones abiertas en otros equipos."""
    auth_service.change_password(db, user, body.current_password, body.new_password, refresh_token)
