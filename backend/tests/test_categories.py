from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import Category, Product, User
from tests.conftest import UserFactory

AuthHeaders = Callable[[User], dict[str, str]]

CATEGORIES_URL = "/api/v1/categories"


def add_category(db: Session, name: str, *, is_active: bool = True) -> Category:
    category = Category(name=name, is_active=is_active)
    db.add(category)
    db.flush()
    return category


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("post", CATEGORIES_URL),
        ("patch", f"{CATEGORIES_URL}/1"),
        ("delete", f"{CATEGORIES_URL}/1"),
    ],
)
def test_cashier_cannot_manage_categories(
    client: TestClient, cashier: User, auth_headers: AuthHeaders, method: str, url: str
) -> None:
    response = client.request(method, url, headers=auth_headers(cashier), json={})

    assert response.status_code == 403


def test_cashier_can_read_categories(
    client: TestClient, db_session: Session, cashier: User, auth_headers: AuthHeaders
) -> None:
    add_category(db_session, "Bebidas")

    response = client.get(CATEGORIES_URL, headers=auth_headers(cashier))

    assert response.status_code == 200
    assert [c["name"] for c in response.json()["items"]] == ["Bebidas"]


# --- CRUD ----------------------------------------------------------------------------


def test_create_and_update_category(
    client: TestClient, make_user: UserFactory, auth_headers: AuthHeaders
) -> None:
    headers = auth_headers(make_user(RoleCode.INVENTORY))

    created = client.post(
        CATEGORIES_URL, json={"name": "  Snacks ", "description": "  "}, headers=headers
    )
    assert created.status_code == 201
    body = created.json()
    assert (body["name"], body["description"], body["is_active"]) == ("Snacks", None, True)

    url = f"{CATEGORIES_URL}/{body['id']}"
    changes = {"description": "Paquetes", "is_active": False}
    updated = client.patch(url, json=changes, headers=headers)
    assert updated.status_code == 200
    assert (updated.json()["name"], updated.json()["description"]) == ("Snacks", "Paquetes")
    assert updated.json()["is_active"] is False

    cleared = client.patch(url, json={"description": None}, headers=headers)
    assert cleared.json()["description"] is None


# A conflict rolls back the test session (fixtures included), so one request per test.
@pytest.mark.parametrize("renaming", [False, True])
def test_category_name_is_unique_ignoring_case(
    client: TestClient,
    db_session: Session,
    admin: User,
    auth_headers: AuthHeaders,
    renaming: bool,
) -> None:
    add_category(db_session, "Bebidas")
    other = add_category(db_session, "Aseo")
    headers = auth_headers(admin)

    if renaming:
        url = f"{CATEGORIES_URL}/{other.id}"
        response = client.patch(url, json={"name": "bebidas"}, headers=headers)
    else:
        response = client.post(CATEGORIES_URL, json={"name": "BEBIDAS"}, headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "CATEGORY_NAME_TAKEN"


def test_update_rejects_null_name(
    client: TestClient, db_session: Session, admin: User, auth_headers: AuthHeaders
) -> None:
    category = add_category(db_session, "Bebidas")

    response = client.patch(
        f"{CATEGORIES_URL}/{category.id}", json={"name": None}, headers=auth_headers(admin)
    )

    assert response.status_code == 422


def test_list_categories_filters(
    client: TestClient, db_session: Session, admin: User, auth_headers: AuthHeaders
) -> None:
    add_category(db_session, "Bebidas")
    add_category(db_session, "Bebidas calientes", is_active=False)
    add_category(db_session, "Aseo")
    headers = auth_headers(admin)

    search = client.get(CATEGORIES_URL, params={"search": "bebi"}, headers=headers).json()
    inactive = client.get(CATEGORIES_URL, params={"is_active": False}, headers=headers).json()

    assert [c["name"] for c in search["items"]] == ["Bebidas", "Bebidas calientes"]
    assert [c["name"] for c in inactive["items"]] == ["Bebidas calientes"]


# --- Deletion ------------------------------------------------------------------------


def test_delete_category_without_products(
    client: TestClient, db_session: Session, admin: User, auth_headers: AuthHeaders
) -> None:
    category = add_category(db_session, "Temporal")
    url = f"{CATEGORIES_URL}/{category.id}"

    assert client.delete(url, headers=auth_headers(admin)).status_code == 204
    assert client.get(url, headers=auth_headers(admin)).status_code == 404


def test_delete_category_with_products_is_rejected(
    client: TestClient, db_session: Session, admin: User, auth_headers: AuthHeaders
) -> None:
    category = add_category(db_session, "Bebidas")
    db_session.add(
        Product(sku="BEB-1", name="Agua", category=category, unit_of_measure="unit", sale_price=1)
    )
    db_session.flush()

    response = client.delete(f"{CATEGORIES_URL}/{category.id}", headers=auth_headers(admin))

    assert response.status_code == 409
    assert response.json()["code"] == "CATEGORY_HAS_PRODUCTS"


def test_missing_category_returns_404(
    client: TestClient, admin: User, auth_headers: AuthHeaders
) -> None:
    response = client.get(f"{CATEGORIES_URL}/999999", headers=auth_headers(admin))

    assert response.status_code == 404
    assert response.json()["code"] == "CATEGORY_NOT_FOUND"
