"""Contact fields shared by suppliers and customers."""

from typing import Annotated

from pydantic import BeforeValidator, EmailStr, Field, StringConstraints

from app.schemas.common import optional_text


def _normalize_document(value: object) -> object:
    if isinstance(value, str):
        return value.replace(".", "").replace(" ", "").upper()
    return value


def _normalize_email(value: object) -> object:
    if isinstance(value, str):
        return value.strip().lower() or None
    return value


DocumentNumber = Annotated[
    str,
    BeforeValidator(_normalize_document),
    StringConstraints(min_length=1, max_length=30, pattern=r"^[A-Z0-9][A-Z0-9-]*$"),
    Field(
        examples=["900123456-7"],
        description="Letras, números y guion; con dígito de verificación si es NIT. "
        "Se guarda sin puntos ni espacios y en mayúsculas.",
    ),
]
Phone = Annotated[optional_text(30, pattern=r"^[0-9+() -]+$"), Field(examples=["+57 300 123 4567"])]
Email = Annotated[
    EmailStr | None, BeforeValidator(_normalize_email), Field(examples=["ventas@esperanza.co"])
]
Address = Annotated[optional_text(255), Field(examples=["Calle 10 # 20-30"])]
