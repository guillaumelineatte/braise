from fastapi import APIRouter, Request

from ..errors import ApiError
from ..schemas import AdminMe, ErrorOut, LoginIn, Token
from ..security import LoginThrottle, authenticate, create_access_token
from .deps import AdminDep, SessionDep, SettingsDep

router = APIRouter(prefix="/auth", tags=["Authentification"])


@router.post("/login", response_model=Token, responses={401: {"model": ErrorOut}, 429: {"model": ErrorOut}})
async def login(payload: LoginIn, request: Request, session: SessionDep, settings: SettingsDep) -> Token:
    throttle: LoginThrottle = request.app.state.login_throttle
    key = request.client.host if request.client else "inconnu"
    throttle.check(key)
    user = await authenticate(session, payload.email, payload.password)
    if user is None:
        throttle.fail(key)
        raise ApiError(401, "Adresse ou mot de passe incorrect.")
    throttle.reset(key)
    token, expires = create_access_token(user, settings)
    return Token(access_token=token, token_type="bearer", expires_at=expires)


@router.get("/me", response_model=AdminMe, responses={401: {"model": ErrorOut}, 403: {"model": ErrorOut}})
async def me(admin: AdminDep) -> AdminMe:
    return AdminMe.model_validate(admin)
