import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"] = Field(examples=["ok"])
    database: Literal["ok", "unavailable"] = Field(examples=["ok"])


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse, "description": "Base de datos no disponible"}},
)
def health(db: Annotated[Session, Depends(get_db)]) -> HealthResponse | JSONResponse:
    """Estado de la API y de la conexión a la base de datos."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Health check: database unavailable")
        body = HealthResponse(status="degraded", database="unavailable")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=body.model_dump()
        )
    return HealthResponse(status="ok", database="ok")
