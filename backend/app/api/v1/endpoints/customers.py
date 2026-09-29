from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import DbSession, require_permission
from app.core.permissions import PermissionCode
from app.models import Customer, User
from app.schemas.common import Page, PageParams, page_params
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["customers"])

CustomersReader = Annotated[User, require_permission(PermissionCode.CUSTOMERS_READ)]
CustomersManager = Annotated[User, require_permission(PermissionCode.CUSTOMERS_MANAGE)]


@router.get("", response_model=Page[CustomerResponse])
def list_customers(
    _: CustomersReader,
    db: DbSession,
    params: Annotated[PageParams, Depends(page_params)],
    search: Annotated[
        str | None, Query(max_length=100, description="Busca en nombre, documento y teléfono.")
    ] = None,
    is_active: bool | None = None,
) -> Page[CustomerResponse]:
    """Lista los clientes; "Consumidor final" aparece primero."""
    customers, total = customer_service.list_customers(
        db, params, search=search, is_active=is_active
    )
    return Page(
        items=[CustomerResponse.model_validate(c) for c in customers],
        total=total,
        page=params.page,
        size=params.size,
    )


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, _: CustomersReader, db: DbSession) -> Customer:
    return customer_service.get_customer(db, customer_id)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(body: CustomerCreate, _: CustomersManager, db: DbSession) -> Customer:
    return customer_service.create_customer(db, body)


@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int, body: CustomerUpdate, _: CustomersManager, db: DbSession
) -> Customer:
    """Actualiza datos o estado. Los clientes no se eliminan: se desactivan.
    "Consumidor final" no se puede modificar."""
    return customer_service.update_customer(db, customer_id, body)
