import os
from io import BytesIO
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image as PILImage

from app.config import Settings
from app.db import Base, detect_search_caps
from app.main import create_app
from app.models import AdminUser, Category
from app.security import hash_password
from app.seed_data import CATEGORIES

ADMIN_EMAIL = "chef@braise.test"
ADMIN_PASSWORD = "un-mot-de-passe-solide"
# SQLite jetable par défaut. Pour tester sur Postgres : TEST_DATABASE_URL=postgresql+asyncpg://...
# (attention, le schéma est vidé avant chaque test)
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        environment="test",
        database_url=TEST_DATABASE_URL or f"sqlite+aiosqlite:///{tmp_path}/test.db",
        media_root=tmp_path / "media",
        media_url="/media",
        secret_key="clé-de-test-suffisamment-longue-pour-hs256",
        frontend_origin="http://front.test",
        site_url="https://braise.test",
        admin_email=None,
        admin_password=None,
    )


async def prepare_database(application) -> None:
    async with application.state.engine.begin() as conn:
        if TEST_DATABASE_URL:
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await detect_search_caps(application.state.engine)


@pytest_asyncio.fixture
async def app(settings):
    application = create_app(settings)
    await prepare_database(application)
    yield application
    await application.state.engine.dispose()


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


@pytest_asyncio.fixture
async def admin(app) -> AdminUser:
    async with app.state.sessionmaker() as session:
        user = AdminUser(email=ADMIN_EMAIL, hashed_password=hash_password(ADMIN_PASSWORD))
        session.add(user)
        await session.commit()
        return user


@pytest_asyncio.fixture
async def auth(client, admin) -> dict[str, str]:
    response = await client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest_asyncio.fixture
async def categories(app) -> dict[str, int]:
    async with app.state.sessionmaker() as session:
        items = [Category(name=name, slug=slug, position=i) for i, (name, slug) in enumerate(CATEGORIES, start=1)]
        session.add_all(items)
        await session.commit()
        return {c.slug: c.id for c in items}


def jpeg_bytes(
    width: int = 1200, height: int = 960, color: tuple[int, int, int] = (185, 159, 124), fmt: str = "JPEG"
) -> bytes:
    buffer = BytesIO()
    image = PILImage.new("RGB", (width, height), color)
    # un repère coloré pour vérifier le recadrage
    image.paste((180, 85, 45), (0, 0, width // 4, height // 4))
    image.save(buffer, fmt)
    return buffer.getvalue()


async def upload_image(client: AsyncClient, auth: dict[str, str], **fields: Any) -> dict[str, Any]:
    data = {k: str(v) for k, v in fields.items()}
    files = {"file": ("photo.jpg", jpeg_bytes(), "image/jpeg")}
    response = await client.post("/api/admin/uploads", headers=auth, files=files, data=data)
    assert response.status_code == 201, response.text
    return response.json()


def complete_payload(category_id: int, image_id: int, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "Soupe de lentilles corail",
        "description": "Une soupe douce et épicée, prête en trente minutes.",
        "category_id": category_id,
        "prep_time_minutes": 30,
        "servings": 4,
        "image_id": image_id,
        "calories": 250,
        "protein_g": 14,
        "carbs_g": 35,
        "fat_g": 6,
        "is_dietetic": False,
        "ingredients": [
            {"name": "Lentilles corail", "quantity": 200, "unit": "G"},
            {"name": "Carotte", "quantity": 2, "unit": "UNIT"},
            {"name": "Lait de coco", "quantity": 200, "unit": "ML"},
        ],
        "steps": [
            {"content": "Rincez les lentilles jusqu'à ce que l'eau soit claire."},
            {"content": "Faites-les cuire vingt minutes avec la carotte et le lait de coco."},
        ],
    }
    payload.update(overrides)
    return payload


async def create_published(
    client: AsyncClient,
    auth: dict[str, str],
    category_id: int,
    **overrides: Any,
) -> dict[str, Any]:
    image = await upload_image(client, auth)
    response = await client.post(
        "/api/admin/recipes", headers=auth, json=complete_payload(category_id, image["id"], **overrides)
    )
    assert response.status_code == 201, response.text
    recipe_id = response.json()["id"]
    response = await client.post(f"/api/admin/recipes/{recipe_id}/publish", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()
