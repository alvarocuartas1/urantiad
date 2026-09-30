from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import AuditAction, AuditLog, Category, Product, Role, Supplier, User
from app.services import user_service
from tests.conftest import UserFactory
from tests.test_cash import SESSIONS_URL, add_register, add_session, post_movement
from tests.test_cash_closing import close
from tests.test_categories import add_category
from tests.test_products import add_product, product_payload
from tests.test_purchases import PURCHASES_URL, confirm, create_id, line
from tests.test_purchases import cancel as cancel_purchase
from tests.test_sales import cancel as cancel_sale
from tests.test_sales import item, pay, sell
from tests.test_suppliers import add_supplier

AuthHeaders = Callable[[User], dict[str, str]]

AUDIT_URL = "/api/v1/audit-logs"
PRODUCTS_URL = "/api/v1/products"
SUPPLIERS_URL = "/api/v1/suppliers"
USERS_URL = "/api/v1/users"


@pytest.fixture
def admin_headers(admin: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(admin)


@pytest.fixture
def category(db_session: Session) -> Category:
    return add_category(db_session, "Bebidas")


@pytest.fixture
def product(db_session: Session, category: Category) -> Product:
    return add_product(
        db_session,
        category,
        "AGUA-1",
        name="Agua 600 ml",
        sale_price=Decimal(2000),
        current_stock=Decimal(10),
        average_cost=Decimal(1200),
        last_cost=Decimal(1300),
    )


@pytest.fixture
def supplier(db_session: Session) -> Supplier:
    return add_supplier(db_session, "Distribuidora Andina", "900123456-7")


def logs(db: Session, action: AuditAction | None = None) -> list[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.id)
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    return list(db.scalars(stmt))


def only_log(db: Session, action: AuditAction) -> AuditLog:
    (log,) = logs(db, action)
    return log


# --- Access --------------------------------------------------------------------------


@pytest.mark.parametrize("role", [RoleCode.CASHIER, RoleCode.INVENTORY])
def test_only_the_admin_reads_the_audit_log(
    client: TestClient, make_user: UserFactory, auth_headers: AuthHeaders, role: RoleCode
) -> None:
    response = client.get(AUDIT_URL, headers=auth_headers(make_user(role)))

    assert response.status_code == 403


def test_audit_log_requires_authentication(client: TestClient) -> None:
    assert client.get(AUDIT_URL).status_code == 401


# --- Products and inventory ----------------------------------------------------------


def test_product_creation_is_audited(
    client: TestClient,
    db_session: Session,
    admin: User,
    admin_headers: dict[str, str],
    category: Category,
) -> None:
    response = client.post(PRODUCTS_URL, json=product_payload(category), headers=admin_headers)
    assert response.status_code == 201

    log = only_log(db_session, AuditAction.PRODUCT_CREATE)
    assert (log.user_id, log.entity_type, log.entity_id) == (
        admin.id,
        "product",
        response.json()["id"],
    )
    assert log.entity_label == "BEB-001 · Gaseosa cola 400 ml"
    assert log.old_values is None
    assert log.new_values is not None
    assert log.new_values["category"] == "Bebidas"
    assert (log.new_values["sale_price"], log.new_values["tax_rate"]) == ("2500.00", "19.00")
    assert "cost" not in log.new_values  # physical products get their cost from movements


def test_product_update_records_only_the_changed_fields(
    client: TestClient, db_session: Session, admin_headers: dict[str, str], product: Product
) -> None:
    url = f"{PRODUCTS_URL}/{product.id}"
    response = client.patch(
        url,
        json={"sale_price": "2500", "name": "Agua 600 ml", "is_active": False},
        headers=admin_headers,
    )
    assert response.status_code == 200

    log = only_log(db_session, AuditAction.PRODUCT_UPDATE)
    assert log.old_values == {"sale_price": "2000.00", "is_active": True}
    assert log.new_values == {"sale_price": "2500.00", "is_active": False}


def test_update_without_changes_is_not_audited(
    client: TestClient, db_session: Session, admin_headers: dict[str, str], product: Product
) -> None:
    response = client.patch(
        f"{PRODUCTS_URL}/{product.id}", json={"sale_price": "2000.00"}, headers=admin_headers
    )

    assert response.status_code == 200
    assert logs(db_session) == []


def test_failed_operation_leaves_no_record(
    client: TestClient,
    db_session: Session,
    admin_headers: dict[str, str],
    category: Category,
    product: Product,
) -> None:
    db_session.commit()  # the service's rollback must not undo the setup
    duplicate = client.post(
        PRODUCTS_URL, json=product_payload(category, sku="AGUA-1"), headers=admin_headers
    )
    too_many = client.post(
        "/api/v1/inventory/adjustments",
        json={"product_id": product.id, "direction": "out", "quantity": "11", "reason": "Merma"},
        headers=admin_headers,
    )

    assert (duplicate.status_code, too_many.status_code) == (409, 409)
    assert logs(db_session) == []


def test_stock_adjustment_is_audited_on_the_product(
    client: TestClient, db_session: Session, admin_headers: dict[str, str], product: Product
) -> None:
    response = client.post(
        "/api/v1/inventory/adjustments",
        json={
            "product_id": product.id,
            "direction": "in",
            "quantity": "10",
            "unit_cost": "1400",
            "reason": "Conteo físico",
        },
        headers=admin_headers,
    )
    assert response.status_code == 201

    log = only_log(db_session, AuditAction.PRODUCT_STOCK_ADJUSTMENT)
    assert (log.entity_type, log.entity_id) == ("product", product.id)
    assert log.old_values == {
        "current_stock": "10.00",
        "average_cost": "1200.00",
        "last_cost": "1300.00",
    }
    assert log.new_values == {
        "movement_type": "adjustment_in",
        "quantity": "10.00",
        "unit_cost": "1400.00",
        "reason": "Conteo físico",
        "current_stock": "20.00",
        "average_cost": "1300.00",
        "last_cost": "1400.00",
    }


# --- Sales and cash ------------------------------------------------------------------


def test_cash_session_lifecycle_is_audited(
    client: TestClient, db_session: Session, admin: User, admin_headers: dict[str, str]
) -> None:
    register = add_register(db_session, "Caja Test")
    opened = client.post(
        SESSIONS_URL,
        json={"cash_register_id": register.id, "opening_amount": "100000"},
        headers=admin_headers,
    )
    assert opened.status_code == 201
    session_id = opened.json()["id"]
    assert post_movement(client, session_id, admin_headers, "income", "20000").status_code == 201
    assert (
        post_movement(client, session_id, admin_headers, "withdrawal", "5000", "Domicilio")
    ).status_code == 201
    closed = close(client, admin_headers, session_id, "114000", "115000", "Faltan mil")
    assert closed.status_code == 200

    actions = [(log.action, log.entity_id) for log in logs(db_session)]
    assert actions == [
        (AuditAction.CASH_SESSION_OPEN, session_id),
        (AuditAction.CASH_SESSION_INCOME, session_id),
        (AuditAction.CASH_SESSION_WITHDRAWAL, session_id),
        (AuditAction.CASH_SESSION_CLOSE, session_id),
    ]
    opening, _, withdrawal, closing = logs(db_session)
    assert opening.entity_label == f"Caja Test · apertura #{session_id}"
    assert opening.new_values == {
        "cash_register": "Caja Test",
        "opening_amount": "100000.00",
        "opening_notes": None,
    }
    assert withdrawal.old_values == {"expected_cash": "120000.00"}
    assert withdrawal.new_values == {
        "amount": "5000.00",
        "concept": "Domicilio",
        "expected_cash": "115000.00",
    }
    assert closing.old_values == {"status": "open"}
    assert closing.new_values == {
        "status": "closed",
        "opened_by": admin.username,
        "expected_cash": "115000.00",
        "counted_cash": "114000.00",
        "difference": "-1000.00",
        "closing_notes": "Faltan mil",
    }


def test_sale_cancellation_is_audited_once(
    client: TestClient,
    db_session: Session,
    admin: User,
    admin_headers: dict[str, str],
    cashier: User,
    auth_headers: AuthHeaders,
    product: Product,
) -> None:
    session = add_session(db_session, add_register(db_session, "Caja Test"), cashier, Decimal(0))
    sale = sell(
        client, auth_headers(cashier), [item(product, "2")], [pay(db_session, "cash", "4000")]
    )
    db_session.commit()

    assert cancel_sale(client, admin_headers, sale["id"]).status_code == 200
    assert cancel_sale(client, admin_headers, sale["id"]).status_code == 409

    log = only_log(db_session, AuditAction.SALE_CANCEL)
    assert (log.user_id, log.entity_label) == (admin.id, sale["number"])
    assert log.old_values == {"status": "completed"}
    assert log.new_values == {
        "status": "cancelled",
        "cancellation_reason": "Cobro duplicado",
        "total": "4000.00",
        "cash_refunded": "4000.00",
        "refund_cash_session_id": session.id,
    }
    # Creating a sale is not audited: the sale itself is the immutable record.
    assert [log.action for log in logs(db_session)] == [AuditAction.SALE_CANCEL]


# --- Purchases and suppliers ---------------------------------------------------------


def test_purchase_lifecycle_is_audited(
    client: TestClient,
    db_session: Session,
    admin_headers: dict[str, str],
    supplier: Supplier,
    product: Product,
) -> None:
    purchase_id = create_id(client, admin_headers, supplier, line(product))
    assert confirm(client, admin_headers, purchase_id).status_code == 200
    number = client.get(f"{PURCHASES_URL}/{purchase_id}", headers=admin_headers).json()["number"]
    assert cancel_purchase(client, admin_headers, purchase_id).status_code == 200
    draft_id = create_id(client, admin_headers, supplier, line(product))
    assert client.delete(f"{PURCHASES_URL}/{draft_id}", headers=admin_headers).status_code == 204

    created, confirmed, cancelled, _, discarded = logs(db_session)
    assert created.action == AuditAction.PURCHASE_CREATE
    assert created.entity_label == f"Borrador #{purchase_id} · Distribuidora Andina"
    assert created.new_values == {
        "status": "draft",
        "supplier": "Distribuidora Andina",
        "supplier_invoice_number": None,
        "item_count": 1,
        "total": "15000.00",
    }
    assert confirmed.action == AuditAction.PURCHASE_CONFIRM
    assert confirmed.entity_label == f"{number} · Distribuidora Andina"
    assert confirmed.new_values is not None
    assert (confirmed.new_values["status"], confirmed.new_values["number"]) == (
        "confirmed",
        number,
    )
    assert cancelled.action == AuditAction.PURCHASE_CANCEL
    assert cancelled.new_values == {
        "status": "cancelled",
        "cancellation_reason": "Costos mal digitados",
    }
    assert (discarded.action, discarded.entity_id) == (AuditAction.PURCHASE_DISCARD, draft_id)
    assert discarded.old_values is not None and discarded.new_values is None


def test_supplier_changes_are_audited(
    client: TestClient,
    db_session: Session,
    admin_headers: dict[str, str],
    supplier: Supplier,
    product: Product,
) -> None:
    created = client.post(
        SUPPLIERS_URL,
        json={"document_type": "nit", "document_number": "800111222-3", "name": "Lácteos Sur"},
        headers=admin_headers,
    )
    assert created.status_code == 201
    supplier_url = f"{SUPPLIERS_URL}/{supplier.id}"
    client.patch(supplier_url, json={"phone": "3001234567"}, headers=admin_headers)
    products_url = f"{supplier_url}/products"
    client.post(
        products_url,
        json={"product_id": product.id, "purchase_price": "1100"},
        headers=admin_headers,
    )
    link_url = f"{products_url}/{product.id}"
    client.patch(link_url, json={"purchase_price": "1150"}, headers=admin_headers)
    client.patch(link_url, json={"purchase_price": "1150"}, headers=admin_headers)  # no change
    assert client.delete(link_url, headers=admin_headers).status_code == 204

    actions = [log.action for log in logs(db_session)]
    assert actions == [
        AuditAction.SUPPLIER_CREATE,
        AuditAction.SUPPLIER_UPDATE,
        AuditAction.SUPPLIER_PRODUCT_ADD,
        AuditAction.SUPPLIER_PRODUCT_UPDATE,
        AuditAction.SUPPLIER_PRODUCT_REMOVE,
    ]
    _, updated, _, price, removed = logs(db_session)
    assert (updated.old_values, updated.new_values) == ({"phone": None}, {"phone": "3001234567"})
    # The product is kept on both sides so the record says which link changed.
    assert price.old_values == {"product": "AGUA-1 · Agua 600 ml", "purchase_price": "1100.00"}
    assert price.new_values == {"product": "AGUA-1 · Agua 600 ml", "purchase_price": "1150.00"}
    assert removed.entity_id == supplier.id
    assert removed.old_values is not None and removed.old_values["purchase_price"] == "1150.00"


# --- Users ---------------------------------------------------------------------------


def test_user_changes_are_audited_without_passwords(
    client: TestClient, db_session: Session, admin: User, admin_headers: dict[str, str]
) -> None:
    cashier_role = db_session.scalars(select(Role).where(Role.code == RoleCode.CASHIER)).one()
    inventory_role = db_session.scalars(select(Role).where(Role.code == RoleCode.INVENTORY)).one()
    created = client.post(
        USERS_URL,
        json={
            "username": "maria",
            "full_name": "María López",
            "password": "Segura2026!",
            "role_id": cashier_role.id,
        },
        headers=admin_headers,
    )
    user_url = f"{USERS_URL}/{created.json()['id']}"
    client.patch(user_url, json={"role_id": inventory_role.id}, headers=admin_headers)
    client.put(
        f"{user_url}/password", json={"new_password": "OtraClave2026"}, headers=admin_headers
    )

    creation, update, reset = logs(db_session)
    assert creation.new_values == {
        "username": "maria",
        "full_name": "María López",
        "role": cashier_role.name,
        "is_active": True,
    }
    assert (update.old_values, update.new_values) == (
        {"role": cashier_role.name},
        {"role": inventory_role.name},
    )
    assert (reset.action, reset.user_id) == (AuditAction.USER_PASSWORD_RESET, admin.id)
    assert (reset.old_values, reset.new_values) == (None, None)


def test_create_admin_command_is_audited_without_user(db_session: Session) -> None:
    user = user_service.create_admin(db_session, "jefe", "Jefe", "Segura2026!")

    log = only_log(db_session, AuditAction.USER_CREATE)
    assert (log.user_id, log.entity_id) == (None, user.id)


# --- Listing -------------------------------------------------------------------------


def test_list_filters_and_orders_newest_first(
    client: TestClient,
    db_session: Session,
    admin: User,
    admin_headers: dict[str, str],
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    product: Product,
    category: Category,
) -> None:
    keeper = make_user(RoleCode.INVENTORY)
    other = add_product(db_session, category, "JUGO-1", name="Jugo de mora")
    client.patch(f"{PRODUCTS_URL}/{product.id}", json={"sale_price": "2100"}, headers=admin_headers)
    client.patch(
        f"{PRODUCTS_URL}/{other.id}", json={"sale_price": "3100"}, headers=auth_headers(keeper)
    )
    client.patch(f"{PRODUCTS_URL}/{product.id}", json={"sale_price": "2200"}, headers=admin_headers)

    def ids(**params: Any) -> list[int]:
        response = client.get(AUDIT_URL, params=params, headers=admin_headers)
        assert response.status_code == 200
        return [entry["entity_id"] for entry in response.json()["items"]]

    assert ids() == [product.id, other.id, product.id]
    assert ids(entity_type="product", entity_id=other.id) == [other.id]
    assert ids(user_id=keeper.id) == [other.id]
    assert ids(search="mora") == [other.id]
    assert ids(action="product.create") == []
    assert ids(entity_type="sale") == []

    page = client.get(AUDIT_URL, params={"size": 1, "page": 2}, headers=admin_headers).json()
    assert (page["total"], len(page["items"])) == (3, 1)
    entry = page["items"][0]
    assert entry["user"] == {"id": keeper.id, "full_name": keeper.full_name}
    assert entry["action"] == "product.update"
    assert entry["new_values"] == {"sale_price": "3100.00"}


def test_list_rejects_unknown_action(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get(AUDIT_URL, params={"action": "sale.create"}, headers=admin_headers)

    assert response.status_code == 422


# --- Immutability --------------------------------------------------------------------


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE audit_logs SET entity_label = 'x'",
        "DELETE FROM audit_logs",
        "TRUNCATE audit_logs",
    ],
)
def test_audit_log_is_append_only(db_session: Session, admin: User, statement: str) -> None:
    user_service.create_admin(db_session, "jefe", "Jefe", "Segura2026!")

    with pytest.raises(DBAPIError, match="append-only"), db_session.begin_nested():
        db_session.execute(text(statement))

    assert len(logs(db_session)) == 1


def test_maintenance_mode_allows_purging(db_session: Session) -> None:
    user_service.create_admin(db_session, "jefe", "Jefe", "Segura2026!")

    db_session.execute(text("SET LOCAL app.audit_maintenance = 'on'"))
    db_session.execute(text("DELETE FROM audit_logs"))

    assert logs(db_session) == []
