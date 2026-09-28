"""The API must answer every error with the uniform `{detail, code}` body."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.core.errors import AppError


class ItemIn(BaseModel):
    name: str = Field(min_length=1)
    quantity: int = Field(gt=0)


@pytest.fixture
def error_client(app: FastAPI) -> TestClient:
    @app.post("/test/items")
    def create_item(item: ItemIn) -> ItemIn:
        return item

    @app.get("/test/business-error")
    def business_error() -> None:
        raise AppError("El código de producto ya existe.", code="DUPLICATE_CODE", status_code=409)

    @app.get("/test/crash")
    def crash() -> None:
        raise RuntimeError("secret internal detail")

    return TestClient(app, raise_server_exceptions=False)


def test_unknown_route_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"detail": "Recurso no encontrado.", "code": "NOT_FOUND"}


def test_validation_error_returns_422(error_client: TestClient) -> None:
    response = error_client.post("/test/items", json={"name": "", "quantity": 0})

    body = response.json()
    assert response.status_code == 422
    assert body["code"] == "VALIDATION_ERROR"
    assert "name" in body["detail"]
    assert "quantity" in body["detail"]


def test_business_error_keeps_status_and_code(error_client: TestClient) -> None:
    response = error_client.get("/test/business-error")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "El código de producto ya existe.",
        "code": "DUPLICATE_CODE",
    }


def test_unhandled_error_hides_internal_details(error_client: TestClient) -> None:
    response = error_client.get("/test/crash")

    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
    assert "secret" not in response.text
