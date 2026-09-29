from datetime import datetime
from typing import Annotated, ClassVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models import DocumentType
from app.schemas.common import ORMModel, PartialUpdate
from app.schemas.contact import Address, DocumentNumber, Email, Phone

CustomerName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=150),
    Field(examples=["Laura Martínez"]),
]


class CustomerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_type: DocumentType = DocumentType.CC
    document_number: DocumentNumber
    name: CustomerName
    phone: Phone = None
    email: Email = None
    address: Address = None


class CustomerUpdate(PartialUpdate):
    nullable_fields: ClassVar[frozenset[str]] = frozenset({"phone", "email", "address"})

    document_type: DocumentType | None = None
    document_number: DocumentNumber | None = None
    name: CustomerName | None = None
    phone: Phone = None
    email: Email = None
    address: Address = None
    is_active: bool | None = None


class CustomerSummary(ORMModel):
    id: int
    document_type: DocumentType
    document_number: str
    name: str
    is_active: bool
    is_default: bool = Field(
        description='Cliente del sistema "Consumidor final" (no se edita ni se desactiva).'
    )


class CustomerResponse(CustomerSummary):
    phone: str | None
    email: str | None
    address: str | None
    created_at: datetime
    updated_at: datetime
