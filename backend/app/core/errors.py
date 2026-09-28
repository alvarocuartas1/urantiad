"""Uniform error handling: every error response is `{"detail": str, "code": str}`."""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for business errors raised by services."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "BAD_REQUEST"

    def __init__(self, detail: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(detail)
        self.detail = detail
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


HTTP_STATUS_CODES = {
    400: ("BAD_REQUEST", "Solicitud inválida."),
    401: ("UNAUTHORIZED", "No autenticado."),
    403: ("FORBIDDEN", "No tiene permisos para realizar esta acción."),
    404: ("NOT_FOUND", "Recurso no encontrado."),
    405: ("METHOD_NOT_ALLOWED", "Método no permitido."),
    409: ("CONFLICT", "Conflicto con el estado actual del recurso."),
}


STARLETTE_DEFAULT_DETAILS = {"Not Found", "Method Not Allowed"}


def error_response(status_code: int, detail: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail, "code": code})


def _format_validation_error(exc: RequestValidationError) -> str:
    messages = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error["loc"] if part != "body")
        messages.append(f"{location}: {error['msg']}" if location else error["msg"])
    return "; ".join(messages) or "Datos inválidos."


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.detail, exc.code)


async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code, default_detail = HTTP_STATUS_CODES.get(exc.status_code, ("HTTP_ERROR", "Error."))
    # Starlette's generic English messages ("Not Found") are replaced by clear Spanish ones.
    is_custom_detail = isinstance(exc.detail, str) and exc.detail not in STARLETTE_DEFAULT_DETAILS
    detail = exc.detail if is_custom_detail else default_detail
    return error_response(exc.status_code, detail, code)


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return error_response(
        status.HTTP_422_UNPROCESSABLE_CONTENT, _format_validation_error(exc), "VALIDATION_ERROR"
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Ocurrió un error interno. Intente nuevamente.",
        "INTERNAL_ERROR",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
