from datetime import datetime
from typing import Any

from pydantic import Field, IPvAnyAddress

from app.models import AuditAction, AuditEntity
from app.schemas.common import ORMModel
from app.schemas.product import UserSummary


class AuditLogResponse(ORMModel):
    id: int
    created_at: datetime
    user: UserSummary | None = Field(
        description="Quién hizo el cambio. Nulo para acciones sin sesión (`create-admin`)."
    )
    action: AuditAction
    entity_type: AuditEntity
    entity_id: int
    entity_label: str = Field(
        description="Cómo se llamaba la entidad en ese momento.", examples=["VENTA-000012"]
    )
    old_values: dict[str, Any] | None = Field(
        description="Valores anteriores: solo los campos que cambiaron.",
        examples=[{"sale_price": "1500.00"}],
    )
    new_values: dict[str, Any] | None = Field(
        description="Valores nuevos o datos de la operación. Montos como texto decimal.",
        examples=[{"sale_price": "1800.00"}],
    )
    ip_address: IPvAnyAddress | None = Field(
        description="IP desde la que se hizo el cambio; nula sin petición (CLI) o en registros "
        "anteriores a esta información.",
        examples=["192.168.1.20"],
    )
    user_agent: str | None = Field(
        description="Navegador (User-Agent) de la petición.",
        examples=["Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Edg/140.0"],
    )
