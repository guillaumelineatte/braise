from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "dev-secret-change-me-in-production-please"


class Settings(BaseSettings):
    """Réglages lus dans l'environnement, cf. .env.example."""

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"

    database_url: str = "sqlite+aiosqlite:///./braise.db"

    secret_key: str = DEFAULT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24

    frontend_origin: str = "http://localhost:5173"
    site_url: str = "http://localhost:5173"

    storage_backend: Literal["local", "s3"] = "local"
    media_root: Path = Path("media")
    media_url: str = "/media"
    s3_bucket: str | None = None
    s3_region: str | None = None
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_public_url: str | None = None
    s3_prefix: str = ""

    max_upload_mb: int = 12

    admin_email: str | None = None
    admin_password: str | None = None

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, value: str) -> str:
        # les hébergeurs donnent souvent du postgres://, on force le driver asyncpg
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+asyncpg://" + value[len(prefix) :]
        if value.startswith("sqlite://") and not value.startswith("sqlite+aiosqlite://"):
            return "sqlite+aiosqlite://" + value[len("sqlite://") :]
        return value

    @model_validator(mode="after")
    def _production_secret(self) -> "Settings":
        if self.environment == "production" and (
            self.secret_key == DEFAULT_SECRET or "change-me" in self.secret_key or len(self.secret_key) < 32
        ):
            raise ValueError(
                "SECRET_KEY doit être une chaîne aléatoire d'au moins 32 caractères en production "
                '(python -c "import secrets; print(secrets.token_urlsafe(48))").'
            )
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_origin.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
