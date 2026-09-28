from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from sqlalchemy import DateTime, MetaData, event, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import TypeDecorator

from .text import normalize

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Dates toujours en UTC avec fuseau, même sous SQLite qui ne le stocke pas."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        value = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


@dataclass
class SearchCaps:
    """Extensions de recherche dispo, détectées au démarrage."""

    dialect: str = "sqlite"
    unaccent: bool = False
    trigram: bool = False


search_caps = SearchCaps()


def make_engine(url: str) -> AsyncEngine:
    kwargs: dict[str, Any] = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"timeout": 15}}
    engine = create_async_engine(url, **kwargs)
    if engine.dialect.name == "sqlite":
        _configure_sqlite(engine)
    return engine


def _configure_sqlite(engine: AsyncEngine) -> None:
    @event.listens_for(engine.sync_engine, "connect")
    def _on_connect(dbapi_connection: Any, _record: Any) -> None:
        # pas d'unaccent sous SQLite, on enregistre notre propre fonction
        dbapi_connection.create_function("braise_norm", 1, normalize, deterministic=True)
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


async def detect_search_caps(engine: AsyncEngine) -> SearchCaps:
    search_caps.dialect = engine.dialect.name
    search_caps.unaccent = search_caps.trigram = False
    if engine.dialect.name == "postgresql":
        async with engine.connect() as conn:
            rows = await conn.execute(text("SELECT extname FROM pg_extension"))
            names = {r[0] for r in rows}
        search_caps.unaccent = "unaccent" in names
        search_caps.trigram = "pg_trgm" in names
    return search_caps


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessionmaker() as session:
        yield session
