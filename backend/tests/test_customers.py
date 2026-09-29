from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import Customer, User
from tests.conftest import UserFactory

AuthHeaders = Callable[[User], dict[str, str]]

CUSTOMERS_URL = "/api/v1/customers"


@pytest.fixture
def headers(cashier: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(cashier)


@pytest.fixture
def customer(db_session: Session) -> Customer:
    return add_customer(db_session, "Laura Martínez", "1020304050")


@pytest.fixture
def default_customer(db_session: Session) -> Customer:
    return db_session.scalars(select(Customer).where(Customer.is_default)).one()


def add_customer(db: Session, name: str, document: str, **fields: Any) -> Customer:
    customer = Customer(name=name, document_type="cc", document_number=document, **fields)
    db.add(customer)
    db.flush()
    return customer


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize("role", [RoleCode.ADMIN, RoleCode.CASHIER])
def test_admin_and_cashier_manage_customers(
    client: TestClient, make_user: UserFactory, auth_headers: AuthHeaders, role: RoleCode
) -> None:
    headers = auth_headers(make_user(role))

    assert client.get(CUSTOMERS_URL, headers=headers).status_code == 200
    created = client.post(
        CUSTOMERS_URL, json={"document_number": "123", "name": "Ana"}, headers=headers
    )
    assert created.status_code == 201


@pytest.mark.parametrize(
    ("method", "url"),
    [("get", CUSTOMERS_URL), ("post", CUSTOMERS_URL), ("patch", f"{CUSTOMERS_URL}/1")],
)
def test_inventory_role_has_no_access_to_customers(
    client: TestClient, make_user: UserFactory, auth_headers: AuthHeaders, method: str, url: str
) -> None:
    headers = auth_headers(make_user(RoleCode.INVENTORY))

    assert client.request(method, url, headers=headers, json={}).status_code == 403


def test_customers_require_authentication(client: TestClient) -> None:
    assert client.get(CUSTOMERS_URL).status_code == 401


# --- Default customer ----------------------------------------------------------------


def test_default_customer_is_seeded(default_customer: Customer) -> None:
    assert default_customer.name == "Consumidor final"
    assert default_customer.document_number == "222222222222"
    assert default_customer.is_active


def test_only_one_default_customer_can_exist(db_session: Session) -> None:
    with pytest.raises(IntegrityError, match="uq_customers_is_default"):
        add_customer(db_session, "Otro", "999", is_default=True)


@pytest.mark.parametrize("body", [{"name": "Cliente"}, {"is_active": False}, {"phone": "300"}])
def test_default_customer_cannot_be_modified(
    client: TestClient,
    headers: dict[str, str],
    default_customer: Customer,
    body: dict[str, Any],
) -> None:
    response = client.patch(f"{CUSTOMERS_URL}/{default_customer.id}", json=body, headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "DEFAULT_CUSTOMER_READONLY"


def test_is_default_cannot_be_set_through_the_api(
    client: TestClient, headers: dict[str, str], customer: Customer
) -> None:
    created = client.post(
        CUSTOMERS_URL,
        json={"document_number": "123", "name": "Ana", "is_default": True},
        headers=headers,
    )
    updated = client.patch(
        f"{CUSTOMERS_URL}/{customer.id}", json={"is_default": True}, headers=headers
    )

    assert created.status_code == 422
    assert updated.status_code == 422


# --- Create --------------------------------------------------------------------------


def test_create_customer_normalizes_fields(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        CUSTOMERS_URL,
        json={
            "document_number": " 1.020.304.050 ",
            "name": "  Laura Martínez ",
            "email": "  Laura@Correo.CO ",
            "phone": "+57 300 123 4567",
            "address": "   ",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["document_type"] == "cc"
    assert body["document_number"] == "1020304050"
    assert body["name"] == "Laura Martínez"
    assert body["email"] == "laura@correo.co"
    assert body["address"] is None
    assert body["is_active"] is True
    assert body["is_default"] is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"email": "no-es-correo"},
        {"phone": "300-ABC"},
        {"document_number": "10#20"},
        {"document_number": ""},
        {"document_type": "rut"},
        {"name": " "},
        {"unknown": "x"},
    ],
)
def test_create_customer_validates_fields(
    client: TestClient, headers: dict[str, str], overrides: dict[str, Any]
) -> None:
    body = {"document_number": "123", "name": "Ana", **overrides}

    response = client.post(CUSTOMERS_URL, json=body, headers=headers)

    assert response.status_code == 422


def test_duplicate_document_is_rejected(
    client: TestClient, headers: dict[str, str], customer: Customer
) -> None:
    response = client.post(
        CUSTOMERS_URL,
        json={"document_type": "cc", "document_number": "1.020.304.050", "name": "Otra"},
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Ya existe un cliente con ese tipo y número de documento.",
        "code": "CUSTOMER_DOCUMENT_TAKEN",
    }


def test_same_number_with_another_document_type_is_allowed(
    client: TestClient, headers: dict[str, str], customer: Customer
) -> None:
    response = client.post(
        CUSTOMERS_URL,
        json={"document_type": "nit", "document_number": "1020304050", "name": "Empresa"},
        headers=headers,
    )

    assert response.status_code == 201


# --- Read ----------------------------------------------------------------------------


def test_list_puts_default_customer_first_then_by_name(
    client: TestClient, headers: dict[str, str], db_session: Session
) -> None:
    add_customer(db_session, "Zoe", "3")
    add_customer(db_session, "Andrés", "1")

    response = client.get(CUSTOMERS_URL, headers=headers)

    names = [item["name"] for item in response.json()["items"]]
    assert names == ["Consumidor final", "Andrés", "Zoe"]


@pytest.mark.parametrize(("search", "expected"), [("laura", 1), ("304", 1), ("555 12", 1)])
def test_list_searches_name_document_and_phone(
    client: TestClient,
    headers: dict[str, str],
    db_session: Session,
    search: str,
    expected: int,
) -> None:
    add_customer(db_session, "Laura Martínez", "1020304050", phone="300 555 1234")
    add_customer(db_session, "Pedro", "77")

    response = client.get(CUSTOMERS_URL, params={"search": search}, headers=headers)

    assert response.json()["total"] == expected
    assert response.json()["items"][0]["name"] == "Laura Martínez"


def test_list_filters_by_status_and_paginates(
    client: TestClient, headers: dict[str, str], db_session: Session
) -> None:
    add_customer(db_session, "Activo 1", "1")
    add_customer(db_session, "Activo 2", "2")
    add_customer(db_session, "Inactivo", "3", is_active=False)

    inactive = client.get(CUSTOMERS_URL, params={"is_active": False}, headers=headers).json()
    page = client.get(
        CUSTOMERS_URL, params={"is_active": True, "page": 2, "size": 2}, headers=headers
    ).json()

    assert [item["name"] for item in inactive["items"]] == ["Inactivo"]
    assert page["total"] == 3
    assert [item["name"] for item in page["items"]] == ["Activo 2"]


def test_get_customer(client: TestClient, headers: dict[str, str], customer: Customer) -> None:
    response = client.get(f"{CUSTOMERS_URL}/{customer.id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["document_number"] == "1020304050"


def test_get_missing_customer_returns_404(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get(f"{CUSTOMERS_URL}/999999", headers=headers)

    assert response.status_code == 404
    assert response.json()["code"] == "CUSTOMER_NOT_FOUND"


# --- Update --------------------------------------------------------------------------


def test_update_changes_only_sent_fields(
    client: TestClient, headers: dict[str, str], db_session: Session
) -> None:
    customer = add_customer(db_session, "Laura", "10", phone="300", email="l@correo.co")

    response = client.patch(
        f"{CUSTOMERS_URL}/{customer.id}", json={"name": "Laura M.", "phone": None}, headers=headers
    )

    body = response.json()
    assert response.status_code == 200
    assert body["name"] == "Laura M."
    assert body["phone"] is None
    assert body["email"] == "l@correo.co"


@pytest.mark.parametrize("body", [{"name": None}, {"document_number": None}])
def test_update_rejects_null_in_required_fields(
    client: TestClient, headers: dict[str, str], customer: Customer, body: dict[str, Any]
) -> None:
    response = client.patch(f"{CUSTOMERS_URL}/{customer.id}", json=body, headers=headers)

    assert response.status_code == 422


def test_deactivate_and_reactivate_customer(
    client: TestClient, headers: dict[str, str], customer: Customer
) -> None:
    url = f"{CUSTOMERS_URL}/{customer.id}"

    assert (
        client.patch(url, json={"is_active": False}, headers=headers).json()["is_active"] is False
    )
    assert client.patch(url, json={"is_active": True}, headers=headers).json()["is_active"] is True


def test_update_to_taken_document_is_rejected(
    client: TestClient, headers: dict[str, str], db_session: Session, customer: Customer
) -> None:
    other = add_customer(db_session, "Otro", "55")

    response = client.patch(
        f"{CUSTOMERS_URL}/{other.id}", json={"document_number": "1020304050"}, headers=headers
    )

    assert response.status_code == 409
    assert response.json()["code"] == "CUSTOMER_DOCUMENT_TAKEN"


def test_update_missing_customer_returns_404(client: TestClient, headers: dict[str, str]) -> None:
    response = client.patch(f"{CUSTOMERS_URL}/999999", json={"name": "X"}, headers=headers)

    assert response.status_code == 404
