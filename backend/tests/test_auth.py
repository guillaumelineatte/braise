from datetime import UTC, datetime, timedelta

import jwt
import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import create_app
from app.models import AdminUser
from conftest import ADMIN_EMAIL, ADMIN_PASSWORD, prepare_database

ADMIN_ROUTES = [
    ("GET", "/api/admin/dashboard"),
    ("GET", "/api/admin/recipes"),
    ("POST", "/api/admin/recipes"),
    ("PATCH", "/api/admin/recipes/1"),
    ("POST", "/api/admin/recipes/1/publish"),
    ("DELETE", "/api/admin/recipes/1"),
    ("POST", "/api/admin/uploads"),
    ("GET", "/api/admin/categories"),
    ("POST", "/api/admin/categories/reorder"),
    ("GET", "/api/auth/me"),
]


async def test_login_returns_token_and_me(client, admin):
    response = await client.post("/api/auth/login", json={"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    expires = datetime.fromisoformat(body["expires_at"])
    assert timedelta(hours=23) < expires - datetime.now(UTC) <= timedelta(hours=24)

    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == ADMIN_EMAIL


@pytest.mark.parametrize(
    ("email", "password"),
    [(ADMIN_EMAIL, "mauvais-mot-de-passe"), ("inconnu@braise.test", ADMIN_PASSWORD)],
)
async def test_login_rejects_bad_credentials(client, admin, email, password):
    response = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 401
    assert response.json()["detail"] == "Adresse ou mot de passe incorrect."


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
async def test_admin_routes_require_token(client, method, path):
    response = await client.request(method, path)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES[:4])
async def test_invalid_token_is_forbidden(client, admin, method, path):
    response = await client.request(method, path, headers={"Authorization": "Bearer pas-un-jeton"})
    assert response.status_code == 403


async def test_expired_or_forged_tokens_are_forbidden(client, admin, settings):
    now = datetime.now(UTC)
    expired = jwt.encode({"sub": "1", "exp": now - timedelta(minutes=1)}, settings.secret_key, algorithm="HS256")
    forged = jwt.encode(
        {"sub": "1", "exp": now + timedelta(hours=1)}, "une-autre-clé-bien-longue-et-fausse", algorithm="HS256"
    )
    for token in (expired, forged):
        response = await client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403


async def test_login_is_throttled(client, admin):
    for _ in range(10):
        await client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": "faux"})
    response = await client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert response.status_code == 429


async def test_admin_created_from_environment_on_first_start(settings):
    settings.admin_email = "Premier@Braise.test"
    settings.admin_password = "mot-de-passe-initial"
    app = create_app(settings)
    await prepare_database(app)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/auth/login", json={"email": "premier@braise.test", "password": "mot-de-passe-initial"}
            )
            assert response.status_code == 200
    # au redémarrage il y a déjà un admin, donc on ne doit pas en créer un 2e
    settings.admin_email = "second@braise.test"
    app2 = create_app(settings)
    async with LifespanManager(app2):
        async with app2.state.sessionmaker() as session:
            emails = (await session.scalars(select(AdminUser.email))).all()
    assert emails == ["premier@braise.test"]
