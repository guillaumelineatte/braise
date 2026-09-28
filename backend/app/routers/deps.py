from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings
from ..db import get_session
from ..models import AdminUser
from ..security import current_admin
from ..storage import Storage


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


SessionDep = Annotated[AsyncSession, Depends(get_session)]
StorageDep = Annotated[Storage, Depends(get_storage)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
AdminDep = Annotated[AdminUser, Depends(current_admin)]
