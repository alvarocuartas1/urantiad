from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import RoleCode
from app.models import AuditAction, AuditLog, PaymentMethod, User
from app.services.payment_method_service import slugify
from tests.conftest import UserFactory
from tests.test_audit import logs, only_log

AuthHeaders = Callable[[User], dict[str, str]]

URL = "/api/v1/payment-methods"


@pytest.fixture
def admin_headers(admin: User, auth_headers: AuthHeaders) -> dict[str, str]:
    return auth_headers(admin)


def method_by_code(db: Session, code: str) -> PaymentMethod:
    return db.scalars(select(PaymentMethod).where(PaymentMethod.code == code)).one()


def create(client: TestClient, headers: dict[str, str], **fields: Any) -> Any:
    return client.post(URL, json={"name": "Bre-B", **fields}, headers=headers)


# --- Permissions ---------------------------------------------------------------------


@pytest.mark.parametrize("role", [RoleCode.CASHIER, RoleCode.INVENTORY])
def test_only_the_admin_manages_payment_methods(
    client: TestClient,
    db_session: Session,
    make_user: UserFactory,
    auth_headers: AuthHeaders,
    role: RoleCode,
) -> None:
    headers = auth_headers(make_user(role))
    cash = method_by_code(db_session, "cash")

    assert create(client, headers).status_code == 403
    assert client.patch(f"{URL}/{cash.id}", json={}, headers=headers).status_code == 403
    listed = client.get(URL, params={"include_inactive": True}, headers=headers)
    assert listed.status_code == 403


def test_cashier_lists_the_active_methods(
    client: TestClient, db_session: Session, cashier: User, auth_headers: AuthHeaders
) -> None:
    method_by_code(db_session, "other").is_active = False
    db_session.flush()

    response = client.get(URL, headers=auth_headers(cashier))

    assert response.status_code == 200
    assert "other" not in [method["code"] for method in response.json()]


def test_admin_lists_inactive_methods_too(
    client: TestClient, db_session: Session, admin_headers: dict[str, str]
) -> None:
    method_by_code(db_session, "other").is_active = False
    db_session.flush()

    methods = client.get(URL, params={"include_inactive": True}, headers=admin_headers).json()

    other = next(method for method in methods if method["code"] == "other")
    assert (other["is_active"], other["sort_order"]) == (False, 7)
    assert len(methods) == 7


# --- Create --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "code"),
    [
        ("Bre-B", "bre_b"),
        ("  Crédito  Almacén ", "credito_almacen"),
        ("¡¡!!", "method"),
        ("Pago con código QR de la tienda del barrio", "pago_con_codigo_qr_de_la_tiend"),
    ],
)
def test_slugify(name: str, code: str) -> None:
    assert slugify(name) == code


def test_create_generates_the_code_and_is_audited(
    client: TestClient, db_session: Session, admin: User, admin_headers: dict[str, str]
) -> None:
    response = create(client, admin_headers, sort_order=8)

    assert response.status_code == 201, response.json()
    body = response.json()
    assert {k: body[k] for k in ("code", "name", "is_cash", "is_active", "sort_order")} == {
        "code": "bre_b",
        "name": "Bre-B",
        "is_cash": False,
        "is_active": True,
        "sort_order": 8,
    }
    log = only_log(db_session, AuditAction.PAYMENT_METHOD_CREATE)
    assert (log.user_id, log.entity_id, log.entity_label) == (admin.id, body["id"], "Bre-B")
    assert log.new_values == {"code": "bre_b", "name": "Bre-B", "sort_order": 8, "is_active": True}


def test_code_gets_a_suffix_when_taken(
    client: TestClient, db_session: Session, admin_headers: dict[str, str]
) -> None:
    # "Other" would be "other", already used by the seeded "Otro".
    method_by_code(db_session, "cash").name = "Contado"
    db_session.flush()

    assert create(client, admin_headers, name="Other").json()["code"] == "other_2"
    assert create(client, admin_headers, name="Other!").json()["code"] == "other_3"


@pytest.mark.parametrize("name", ["Nequi", "NEQUI", " nequi "])
def test_names_are_unique_regardless_of_case(
    client: TestClient, db_session: Session, admin_headers: dict[str, str], name: str
) -> None:
    response = create(client, admin_headers, name=name)

    assert response.status_code == 409
    assert response.json()["code"] == "PAYMENT_METHOD_NAME_TAKEN"
    assert logs(db_session, AuditAction.PAYMENT_METHOD_CREATE) == []


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": "x" * 51},
        {"name": "Bre-B", "sort_order": -1},
        {"name": "B", "is_cash": True},
    ],
)
def test_create_validates_the_input(
    client: TestClient, admin_headers: dict[str, str], payload: dict[str, Any]
) -> None:
    assert client.post(URL, json=payload, headers=admin_headers).status_code == 422


# --- Update --------------------------------------------------------------------------


def test_update_records_only_the_changed_fields(
    client: TestClient, db_session: Session, admin_headers: dict[str, str]
) -> None:
    nequi = method_by_code(db_session, "nequi")

    response = client.patch(
        f"{URL}/{nequi.id}",
        json={"name": "Nequi QR", "sort_order": nequi.sort_order, "is_active": False},
        headers=admin_headers,
    )

    assert response.status_code == 200, response.json()
    assert (response.json()["name"], response.json()["code"]) == ("Nequi QR", "nequi")
    log = only_log(db_session, AuditAction.PAYMENT_METHOD_UPDATE)
    assert (log.old_values, log.new_values) == (
        {"name": "Nequi", "is_active": True},
        {"name": "Nequi QR", "is_active": False},
    )


def test_update_without_changes_is_not_audited(
    client: TestClient, db_session: Session, admin_headers: dict[str, str]
) -> None:
    nequi = method_by_code(db_session, "nequi")
    response = client.patch(f"{URL}/{nequi.id}", json={"name": "Nequi"}, headers=admin_headers)

    assert response.status_code == 200
    assert logs(db_session, AuditAction.PAYMENT_METHOD_UPDATE) == []


def test_cash_cannot_be_deactivated(
    client: TestClient, db_session: Session, admin_headers: dict[str, str]
) -> None:
    cash = method_by_code(db_session, "cash")

    response = client.patch(f"{URL}/{cash.id}", json={"is_active": False}, headers=admin_headers)

    assert response.status_code == 409
    assert response.json()["code"] == "CASH_METHOD_REQUIRED"
    db_session.refresh(cash)
    assert cash.is_active is True
    # Renaming it is fine.
    renamed = client.patch(f"{URL}/{cash.id}", json={"name": "Contado"}, headers=admin_headers)
    assert renamed.status_code == 200


@pytest.mark.parametrize("payload", [{"is_cash": True}, {"code": "x"}, {"name": None}])
def test_update_rejects_fixed_fields(
    client: TestClient, db_session: Session, admin_headers: dict[str, str], payload: Any
) -> None:
    nequi = method_by_code(db_session, "nequi")
    assert client.patch(f"{URL}/{nequi.id}", json=payload, headers=admin_headers).status_code == 422


def test_rename_to_a_taken_name_is_rejected(
    client: TestClient, db_session: Session, admin_headers: dict[str, str]
) -> None:
    nequi = method_by_code(db_session, "nequi")
    response = client.patch(f"{URL}/{nequi.id}", json={"name": "daviplata"}, headers=admin_headers)

    assert response.status_code == 409
    assert response.json()["code"] == "PAYMENT_METHOD_NAME_TAKEN"


def test_update_missing_method(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.patch(f"{URL}/999999", json={"name": "X"}, headers=admin_headers)
    assert response.status_code == 404
    assert response.json()["code"] == "PAYMENT_METHOD_NOT_FOUND"


# --- Request origin in the audit log -------------------------------------------------


def test_audit_records_the_ip_and_browser_of_the_request(
    app: FastAPI, db_session: Session, admin_headers: dict[str, str]
) -> None:
    browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36 Edg/140.0"
    with TestClient(app, client=("192.168.1.20", 50000)) as remote:
        response = remote.post(
            URL, json={"name": "Bre-B"}, headers={**admin_headers, "User-Agent": browser}
        )
    assert response.status_code == 201

    log = only_log(db_session, AuditAction.PAYMENT_METHOD_CREATE)
    assert (str(log.ip_address), log.user_agent) == ("192.168.1.20", browser)


def test_audit_log_api_returns_the_origin(
    app: FastAPI, db_session: Session, admin_headers: dict[str, str]
) -> None:
    with TestClient(app, client=("2001:db8::1", 50000)) as remote:
        remote.post(URL, json={"name": "Bre-B"}, headers={**admin_headers, "User-Agent": "x" * 300})
        body = remote.get("/api/v1/audit-logs", headers=admin_headers).json()

    log = body["items"][0]
    assert log["ip_address"] == "2001:db8::1"
    assert log["user_agent"] == "x" * 255


def test_a_host_that_is_not_an_ip_is_stored_as_null(
    client: TestClient, db_session: Session, admin_headers: dict[str, str]
) -> None:
    # The default test client reports the host "testclient" and a "testclient" User-Agent.
    create(client, admin_headers)

    log = only_log(db_session, AuditAction.PAYMENT_METHOD_CREATE)
    assert (log.ip_address, log.user_agent) == (None, "testclient")


def test_forwarded_headers_are_not_trusted_by_the_app(
    app: FastAPI, db_session: Session, admin_headers: dict[str, str]
) -> None:
    with TestClient(app, client=("10.0.0.5", 50000)) as remote:
        remote.post(
            URL, json={"name": "Bre-B"}, headers={**admin_headers, "X-Forwarded-For": "1.2.3.4"}
        )

    log = db_session.scalars(select(AuditLog).order_by(AuditLog.id.desc())).first()
    assert log is not None
    assert str(log.ip_address) == "10.0.0.5"
