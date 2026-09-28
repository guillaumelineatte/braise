"""Routes admin des catégories, derrière le JWT."""

from fastapi import APIRouter, Depends, Response

from ..schemas import CategoryAdmin, CategoryCreate, CategoryReorder, CategoryUpdate, ErrorOut
from ..security import current_admin
from ..services import categories as service
from .deps import SessionDep

router = APIRouter(
    prefix="/admin/categories", tags=["Administration — catégories"], dependencies=[Depends(current_admin)]
)

ERRORS = {
    401: {"model": ErrorOut},
    403: {"model": ErrorOut},
    404: {"model": ErrorOut},
    409: {"model": ErrorOut},
    422: {"model": ErrorOut},
}


@router.get("", response_model=list[CategoryAdmin], responses=ERRORS)
async def list_categories(session: SessionDep) -> list[CategoryAdmin]:
    return await service.admin_categories(session)


@router.post("", response_model=CategoryAdmin, status_code=201, responses=ERRORS)
async def create_category(payload: CategoryCreate, session: SessionDep) -> CategoryAdmin:
    category = await service.create_category(session, payload.name)
    return await service.admin_category(session, category.id)


@router.post("/reorder", response_model=list[CategoryAdmin], responses=ERRORS)
async def reorder(payload: CategoryReorder, session: SessionDep) -> list[CategoryAdmin]:
    await service.reorder_categories(session, payload.ids)
    return await service.admin_categories(session)


@router.patch("/{category_id}", response_model=CategoryAdmin, responses=ERRORS)
async def rename(category_id: int, payload: CategoryUpdate, session: SessionDep) -> CategoryAdmin:
    """Le slug suit le nouveau nom, sauf si une recette de la catégorie a déjà été publiée."""
    if payload.name is not None:
        await service.rename_category(session, category_id, payload.name)
    return await service.admin_category(session, category_id)


@router.delete("/{category_id}", status_code=204, response_class=Response, responses=ERRORS)
async def delete(category_id: int, session: SessionDep) -> Response:
    """Refusé (409) tant qu'il reste des recettes dedans."""
    await service.delete_category(session, category_id)
    return Response(status_code=204)
