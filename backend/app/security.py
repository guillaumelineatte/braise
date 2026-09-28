"""Auth de l'admin : argon2 pour les mots de passe, JWT valable 24 h."""

import time
from collections import defaultdict, deque
from datetime import datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .db import get_session, utcnow
from .errors import ApiError
from .models import AdminUser

_hasher = PasswordHasher()
# Hash bidon pour les emails inconnus : même temps de réponse que pour un vrai compte.
_DUMMY_HASH = _hasher.hash("braise-dummy-password")
_bearer = HTTPBearer(auto_error=False, description="Jeton obtenu via POST /api/auth/login")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hashed: str | None, password: str) -> bool:
    try:
        return _hasher.verify(hashed or _DUMMY_HASH, password) and hashed is not None
    except (VerificationError, InvalidHashError):
        return False


def create_access_token(user: AdminUser, settings: Settings) -> tuple[str, datetime]:
    now = utcnow()
    expires = now + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": str(user.id), "email": user.email, "iat": int(now.timestamp()), "exp": int(expires.timestamp())}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm), expires


async def authenticate(session: AsyncSession, email: str, password: str) -> AdminUser | None:
    user = await session.scalar(select(AdminUser).where(func.lower(AdminUser.email) == email.lower()))
    if not verify_password(user.hashed_password if user else None, password):
        return None
    return user


async def current_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> AdminUser:
    """Pas de jeton : 401. Jeton invalide ou expiré : 403."""
    if credentials is None:
        raise ApiError(401, "Authentification requise.")
    settings: Settings = request.app.state.settings
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        raise ApiError(403, "Jeton invalide ou expiré.") from None
    user = await session.get(AdminUser, user_id)
    if user is None:
        raise ApiError(403, "Jeton invalide ou expiré.")
    return user


class LoginThrottle:
    """Anti brute-force basique, en mémoire, par IP (ne suffit pas avec plusieurs workers)."""

    def __init__(self, attempts: int = 10, window_seconds: int = 300) -> None:
        self.attempts = attempts
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.attempts:
            raise ApiError(429, "Trop de tentatives. Réessayez dans quelques minutes.")

    def fail(self, key: str) -> None:
        self._hits[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)
