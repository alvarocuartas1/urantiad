from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession, require_permission
from app.core.errors import ForbiddenError
from app.core.permissions import PermissionCode
from app.models import User
from app.schemas.payment_method import (
    PaymentMethodCreate,
    PaymentMethodResponse,
    PaymentMethodUpdate,
)
from app.services import payment_method_service

router = APIRouter(prefix="/payment-methods", tags=["payment-methods"])

PaymentMethodsManager = Annotated[User, require_permission(PermissionCode.PAYMENT_METHODS_MANAGE)]


@router.get("", response_model=list[PaymentMethodResponse])
def list_payment_methods(
    user: CurrentUser,
    db: DbSession,
    include_inactive: Annotated[
        bool, Query(description="También los inactivos; requiere `payment_methods.manage`.")
    ] = False,
) -> list[PaymentMethodResponse]:
    """Payment methods in the order the POS shows them. Active ones with `sales.read`."""
    required = (
        PermissionCode.PAYMENT_METHODS_MANAGE if include_inactive else PermissionCode.SALES_READ
    )
    if required not in user.permission_codes:
        raise ForbiddenError("No tiene permisos para realizar esta acción.")
    methods = payment_method_service.list_payment_methods(db, include_inactive=include_inactive)
    return [PaymentMethodResponse.model_validate(method) for method in methods]


@router.post("", response_model=PaymentMethodResponse, status_code=status.HTTP_201_CREATED)
def create_payment_method(
    actor: PaymentMethodsManager, db: DbSession, data: PaymentMethodCreate
) -> PaymentMethodResponse:
    """Add a payment method. Its `code` is generated from the name and never changes. Name
    already used (regardless of case): 409 `PAYMENT_METHOD_NAME_TAKEN`."""
    method = payment_method_service.create_payment_method(db, actor, data)
    return PaymentMethodResponse.model_validate(method)


@router.patch("/{method_id}", response_model=PaymentMethodResponse)
def update_payment_method(
    actor: PaymentMethodsManager, db: DbSession, method_id: int, data: PaymentMethodUpdate
) -> PaymentMethodResponse:
    """Rename, reorder, activate or deactivate a method. Sales already paid with it do not
    change. Deactivating cash: 409 `CASH_METHOD_REQUIRED`."""
    method = payment_method_service.update_payment_method(db, actor, method_id, data)
    return PaymentMethodResponse.model_validate(method)
