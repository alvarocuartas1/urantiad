from typing import Literal

from pydantic import BaseModel, Field

from app.models import User
from app.schemas.role import RoleSummary
from app.schemas.user import Password


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50, examples=["admin"])
    password: str = Field(min_length=1, max_length=128, examples=["Segura2026!"])


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: Password


class CurrentUserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: RoleSummary
    permissions: list[str] = Field(examples=[["users.read", "users.manage"]])

    @classmethod
    def from_user(cls, user: User) -> "CurrentUserResponse":
        return cls(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            role=RoleSummary.model_validate(user.role),
            permissions=sorted(user.permission_codes),
        )


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Vida del access token en segundos.", examples=[900])
    user: CurrentUserResponse
