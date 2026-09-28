import os
from collections.abc import Callable, Iterator
from pathlib import Path

# Point the app at the test database before any app module reads the settings.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://urantiad:urantiad@localhost:5432/urantiad_test"
)
os.environ["ENVIRONMENT"] = "test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-with-at-least-32-characters"

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, select
from sqlalchemy.orm import Session

from app.core.database import engine, get_db
from app.core.permissions import RoleCode
from app.core.security import create_access_token, hash_password
from app.main import create_app
from app.models import Role, User

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


DEFAULT_PASSWORD = "Password123"
# Hashing with Argon2 is deliberately slow, so the fixtures reuse one hash.
DEFAULT_PASSWORD_HASH = hash_password(DEFAULT_PASSWORD)

UserFactory = Callable[..., User]


@pytest.fixture
def make_user(db_session: Session) -> UserFactory:
    counter = 0

    def factory(
        role: RoleCode = RoleCode.ADMIN,
        *,
        username: str | None = None,
        is_active: bool = True,
    ) -> User:
        nonlocal counter
        counter += 1
        user = User(
            username=username or f"{role.value}{counter}",
            full_name=f"Test {role.value} {counter}",
            password_hash=DEFAULT_PASSWORD_HASH,
            role=db_session.scalar(select(Role).where(Role.code == role)),
            is_active=is_active,
        )
        db_session.add(user)
        db_session.flush()
        return user

    return factory


@pytest.fixture
def admin(make_user: UserFactory) -> User:
    return make_user(RoleCode.ADMIN, username="admin")


@pytest.fixture
def cashier(make_user: UserFactory) -> User:
    return make_user(RoleCode.CASHIER, username="cajero")


@pytest.fixture
def auth_headers() -> Callable[[User], dict[str, str]]:
    def build(user: User) -> dict[str, str]:
        token, _ = create_access_token(user.id)
        return {"Authorization": f"Bearer {token}"}

    return build
