"""Application FastAPI de Braise."""

import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import Settings, get_settings
from .db import detect_search_caps, make_engine, make_sessionmaker
from .errors import install_error_handlers
from .models import AdminUser
from .routers import admin_categories, admin_media, admin_recipes, auth, public
from .security import LoginThrottle, hash_password
from .storage import LocalStorage, make_storage

logger = logging.getLogger("braise.api")

PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300"
MEDIA_CACHE = "public, max-age=31536000, immutable"


class RequestLogMiddleware:
    """Log de chaque requête (méthode, chemin, statut, durée) + en-tête X-Request-ID."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        request_id = uuid.uuid4().hex[:12]
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message).append("X-Request-ID", request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed = (time.perf_counter() - start) * 1000
            logger.info("%s %s %s %.1fms [%s]", scope["method"], scope["path"], status, elapsed, request_id)


class CacheControlMiddleware:
    """Cache court sur les routes publiques, pas de cache côté admin."""

    def __init__(self, app: ASGIApp, media_prefix: str | None) -> None:
        self.app = app
        self.media_prefix = media_prefix

    def _policy(self, method: str, path: str, status: int) -> str | None:
        if path.startswith(("/api/admin", "/api/auth")):
            return "no-store"
        if self.media_prefix and path.startswith(self.media_prefix + "/"):
            return MEDIA_CACHE if status == 200 else None
        if method in ("GET", "HEAD") and (path.startswith("/api/") or path in ("/sitemap.xml", "/robots.txt")):
            if path.startswith(("/api/docs", "/api/openapi")):
                return None
            return PUBLIC_CACHE if status == 200 else "no-cache"
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                policy = self._policy(scope["method"], scope["path"], message["status"])
                if policy:
                    MutableHeaders(scope=message)["Cache-Control"] = policy
            await send(message)

        await self.app(scope, receive, send_wrapper)


class UploadSizeLimitMiddleware:
    """413 direct si le Content-Length dépasse déjà la limite, sans lire le multipart."""

    def __init__(self, app: ASGIApp, path: str, limit: int) -> None:
        self.app = app
        self.path = path
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"] == self.path:
            length = dict(scope["headers"]).get(b"content-length")
            if length and length.isdigit() and int(length) > self.limit:
                mb = (self.limit - 1024 * 1024) // (1024 * 1024)
                body = f'{{"detail":"Fichier trop lourd : {mb} Mo au maximum.","errors":[{{"field":"file","message":"{mb} Mo au maximum."}}]}}'.encode()
                await send(
                    {"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json")]}
                )
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


async def ensure_admin_from_env(app: FastAPI) -> None:
    """Crée l'admin ADMIN_EMAIL / ADMIN_PASSWORD s'il n'y en a encore aucun."""
    settings: Settings = app.state.settings
    if not (settings.admin_email and settings.admin_password):
        return
    try:
        async with app.state.sessionmaker() as session:
            if await session.scalar(select(func.count()).select_from(AdminUser)):
                return
            session.add(
                AdminUser(
                    email=settings.admin_email.strip().lower(), hashed_password=hash_password(settings.admin_password)
                )
            )
            await session.commit()
            logger.info("Administrateur %s créé depuis l'environnement.", settings.admin_email)
    except SQLAlchemyError as exc:
        logger.warning("Administrateur non créé (migrations appliquées ?) : %s", exc)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s — %(message)s")

    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            caps = await detect_search_caps(engine)
            logger.info("Recherche : %s (unaccent=%s, trigram=%s)", caps.dialect, caps.unaccent, caps.trigram)
        except SQLAlchemyError as exc:
            logger.warning("Détection des extensions de recherche impossible : %s", exc)
        await ensure_admin_from_env(app)
        yield
        await engine.dispose()

    app = FastAPI(
        title="Braise API",
        version="1.0.0",
        description="Recettes publiques et administration de Braise.",
        lifespan=lifespan,
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
        redoc_url=None,
        separate_input_output_schemas=False,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = make_sessionmaker(engine)
    app.state.storage = make_storage(settings)
    app.state.login_throttle = LoginThrottle()

    install_error_handlers(app)

    for router in (public.router, auth.router, admin_recipes.router, admin_categories.router, admin_media.router):
        app.include_router(router, prefix="/api")
    app.include_router(public.sitemap_router, prefix="/api")
    app.include_router(public.sitemap_router, include_in_schema=False)

    media_prefix: str | None = None
    if isinstance(app.state.storage, LocalStorage) and settings.media_url.startswith("/"):
        media_prefix = settings.media_url.rstrip("/")
        settings.media_root.mkdir(parents=True, exist_ok=True)
        app.mount(media_prefix, StaticFiles(directory=settings.media_root, check_dir=False), name="media")

    @app.get("/api/health", tags=["Public"], include_in_schema=False)
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # le dernier middleware ajouté est celui qui passe en premier
    app.add_middleware(
        UploadSizeLimitMiddleware, path="/api/admin/uploads", limit=settings.max_upload_bytes + 1024 * 1024
    )
    app.add_middleware(CacheControlMiddleware, media_prefix=media_prefix)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    app.add_middleware(RequestLogMiddleware)
    return app


app = create_app()
