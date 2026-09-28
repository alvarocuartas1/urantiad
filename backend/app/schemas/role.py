from pydantic import Field

from app.schemas.common import ORMModel


class PermissionResponse(ORMModel):
    code: str = Field(examples=["users.read"])
    description: str = Field(examples=["Consultar usuarios."])


class RoleSummary(ORMModel):
    id: int
    code: str = Field(examples=["cashier"])
    name: str = Field(examples=["Cajero"])


class RoleResponse(RoleSummary):
    description: str
    permissions: list[PermissionResponse]
