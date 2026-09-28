import os
from collections.abc import Iterator
from pathlib import Path

# Point the app at the test database before any app module reads the settings.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://urantiad:urantiad@localhost:5432/urantiad_test"
)
os.environ["ENVIRONMENT"] = "test"

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection
from sqlalchemy.orm import Session

from app.core.database import engine, get_db
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Apply every Alembic migration once, so tests run against the real schema."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
def db_connection() -> Iterator[Connection]:
    """Connection wrapped in a transaction that is rolled back after each test."""
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            yield connection
        finally:
            transaction.rollback()


@pytest.fixture
def db_session(db_connection: Connection) -> Iterator[Session]:
    # Commits inside services become SAVEPOINTs, so the outer rollback still undoes everything.
    with Session(bind=db_connection, join_transaction_mode="create_savepoint") as session:
        yield session


@pytest.fixture
def app(db_session: Session) -> FastAPI:
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db_session
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
