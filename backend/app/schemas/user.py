from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, Field, StringConstraints

from app.schemas.common import ORMModel
from app.schemas.role import RoleSummary


def _normalize_username(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


def _require_text(value: str) -> str:
    if not value:
        raise ValueError("no puede estar vacío")
    return value


Username = Annotated[
    str,
    BeforeValidator(_normalize_username),
    StringConstraints(min_length=3, max_length=50, pattern=r"^[a-z0-9._-]+$"),
    Field(
        examples=["maria.lopez"],
        description="De 3 a 50 caracteres: letras minúsculas, números, punto, guion o guion bajo.",
    ),
]
FullName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=150),
    AfterValidator(_require_text),
    Field(examples=["María López"]),
]
Password = Annotated[str, Field(min_length=8, max_length=128, examples=["Segura2026!"])]


class UserCreate(BaseModel):
    username: Username
    full_name: FullName
    password: Password
    role_id: int = Field(gt=0, examples=[2])


class UserUpdate(BaseModel):
    """Fields omitted from the request body are left unchanged."""

    full_name: FullName | None = None
    role_id: int | None = Field(default=None, gt=0)
    is_active: bool | None = None


class PasswordReset(BaseModel):
    new_password: Password


class UserResponse(ORMModel):
    id: int
    username: str
    full_name: str
    role: RoleSummary
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
