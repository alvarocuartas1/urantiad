from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(
    str(get_settings().database_url),
    pool_pre_ping=True,
    # Every connection works in UTC; conversion to America/Bogota happens only on display.
    connect_args={"options": "-c timezone=UTC"},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a database session per request."""
    with SessionLocal() as session:
        yield session
