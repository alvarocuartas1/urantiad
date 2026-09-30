from functools import lru_cache
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, PostgresDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and `.env`."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "URANTIAD API"
    environment: Literal["development", "test", "production"] = "development"
    database_url: PostgresDsn
    cors_origins: Annotated[list[str], NoDecode] = []
    log_level: str = "INFO"

    # Authentication
    jwt_secret_key: SecretStr = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=15, gt=0)
    refresh_token_expire_hours: int = Field(default=12, gt=0)
    # Must be true in production (HTTPS) so the refresh cookie is never sent in clear text.
    cookie_secure: bool = False
    login_max_attempts: int = Field(default=5, gt=0)
    login_lockout_minutes: int = Field(default=15, gt=0)

    # Inventory: whether outgoing movements may leave a product with negative stock.
    allow_negative_stock: bool = False

    # Reports: days are grouped in the business's local time (dates are stored in UTC).
    business_timezone: str = "America/Bogota"

    @field_validator("business_timezone")
    @classmethod
    def check_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Zona horaria desconocida: {value}") from exc
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
