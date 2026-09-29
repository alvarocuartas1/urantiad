from datetime import datetime
from decimal import Decimal
from typing import Annotated, ClassVar

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, StringConstraints

from app.models import DocumentType, UnitOfMeasure
from app.schemas.common import ORMModel, PartialUpdate, optional_text
from app.schemas.product import Money


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
SupplierName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=150),
    Field(examples=["Distribuidora La Esperanza S.A.S."]),
]
ContactName = Annotated[optional_text(100), Field(examples=["Marta Gómez"])]
Phone = Annotated[optional_text(30, pattern=r"^[0-9+() -]+$"), Field(examples=["+57 300 123 4567"])]
Email = Annotated[
    EmailStr | None, BeforeValidator(_normalize_email), Field(examples=["ventas@esperanza.co"])
]
Address = Annotated[optional_text(255), Field(examples=["Calle 10 # 20-30"])]
City = Annotated[optional_text(100), Field(examples=["Bogotá"])]
SupplierNotes = optional_text(500)

SupplierSku = Annotated[optional_text(50), Field(examples=["ESP-4410"])]
PurchasePrice = Annotated[
    Money | None, Field(description="Costo unitario de compra sin IVA.", examples=["1800.00"])
]
LinkNotes = optional_text(255)


class SupplierCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_type: DocumentType = DocumentType.NIT
    document_number: DocumentNumber
    name: SupplierName
    contact_name: ContactName = None
    phone: Phone = None
    email: Email = None
    address: Address = None
    city: City = None
    notes: SupplierNotes = None


class SupplierUpdate(PartialUpdate):
    nullable_fields: ClassVar[frozenset[str]] = frozenset(
        {"contact_name", "phone", "email", "address", "city", "notes"}
    )

    document_type: DocumentType | None = None
    document_number: DocumentNumber | None = None
    name: SupplierName | None = None
    contact_name: ContactName = None
    phone: Phone = None
    email: Email = None
    address: Address = None
    city: City = None
    notes: SupplierNotes = None
    is_active: bool | None = None


class SupplierSummary(ORMModel):
    id: int
    document_type: DocumentType
    document_number: str
    name: str
    is_active: bool


class SupplierResponse(SupplierSummary):
    contact_name: str | None
    phone: str | None
    email: str | None
    address: str | None
    city: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class SupplierProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(gt=0, examples=[1])
    supplier_sku: SupplierSku = None
    purchase_price: PurchasePrice = None
    notes: LinkNotes = None


class SupplierProductUpdate(PartialUpdate):
    nullable_fields: ClassVar[frozenset[str]] = frozenset(
        {"supplier_sku", "purchase_price", "notes"}
    )

    supplier_sku: SupplierSku = None
    purchase_price: PurchasePrice = None
    notes: LinkNotes = None


class LinkedProduct(ORMModel):
    id: int
    sku: str
    name: str
    unit_of_measure: UnitOfMeasure
    is_active: bool


class SupplierProductResponse(ORMModel):
    id: int
    supplier: SupplierSummary
    product: LinkedProduct
    supplier_sku: str | None
    purchase_price: Decimal | None = Field(description="Costo unitario de compra sin IVA.")
    price_updated_at: datetime | None = Field(
        description="Fecha del último cambio de precio; nula si no hay precio."
    )
    notes: str | None
    created_at: datetime
    updated_at: datetime
