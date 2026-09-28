"""Les migrations doivent donner exactement le même schéma que les modèles."""

import asyncio
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from app.db import Base, make_engine

BACKEND = Path(__file__).resolve().parents[1]


def _config(url: str) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    config.attributes["database_url"] = url
    config.attributes["skip_logging"] = True
    return config


def test_upgrade_matches_models_and_downgrades(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path}/migrations.db"
    config = _config(url)
    command.upgrade(config, "head")

    async def diff():
        engine = make_engine(url)
        async with engine.connect() as conn:
            result = await conn.run_sync(lambda sync: compare_metadata(MigrationContext.configure(sync), Base.metadata))
        await engine.dispose()
        return result

    assert asyncio.run(diff()) == []
    command.downgrade(config, "base")
