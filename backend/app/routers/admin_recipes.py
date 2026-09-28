"""Routes admin des recettes, toutes derrière le JWT."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select

from ..models import Category, Recipe
from ..schemas import Dashboard, ErrorOut, Page, RecipeAdmin, RecipeAdminRow, RecipeCreate, RecipeUpdate
from ..security import current_admin
from ..services import recipes as service
from ..services.search import search_condition
from ..services.serializers import recipe_admin, recipe_admin_row
from .deps import SessionDep, StorageDep

router = APIRouter(prefix="/admin", tags=["Administration — recettes"], dependencies=[Depends(current_admin)])

ERRORS = {401: {"model": ErrorOut}, 403: {"model": ErrorOut}, 404: {"model": ErrorOut}, 422: {"model": ErrorOut}}


@router.get("/dashboard", response_model=Dashboard, responses=ERRORS)
async def dashboard(session: SessionDep, storage: StorageDep) -> Dashboard:
    published = await session.scalar(select(func.count()).where(Recipe.is_published.is_(True))) or 0
    drafts = await session.scalar(select(func.count()).where(Recipe.is_published.is_(False))) or 0
    categories = await session.scalar(select(func.count()).select_from(Category)) or 0
    recent = await session.scalars(select(Recipe).order_by(Recipe.updated_at.desc(), Recipe.id.desc()).limit(5))
    pending = await session.scalars(
        select(Recipe)
        .where(Recipe.is_published.is_(False))
        .order_by(Recipe.updated_at.desc(), Recipe.id.desc())
        .limit(5)
    )
    return Dashboard(
        published_count=published,
        draft_count=drafts,
        category_count=categories,
        recent=[recipe_admin_row(r, storage) for r in recent.all()],
        drafts=[recipe_admin_row(r, storage) for r in pending.all()],
    )


@router.get("/recipes", response_model=Page[RecipeAdminRow], responses=ERRORS)
async def list_recipes(
    session: SessionDep,
    storage: StorageDep,
    q: Annotated[str | None, Query(max_length=120)] = None,
    status: Literal["published", "draft", "all"] = "all",
    category: Annotated[str | None, Query(description="Slug de catégorie")] = None,
    dietetic: bool | None = None,
    sort: Literal["updated_at", "title", "calories", "published_at"] = "updated_at",
    order: Literal["asc", "desc"] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> Page[RecipeAdminRow]:
    stmt = select(Recipe)
    if status != "all":
        stmt = stmt.where(Recipe.is_published.is_(status == "published"))
    if category:
        stmt = stmt.where(Recipe.category.has(Category.slug == category))
    if dietetic is not None:
        stmt = stmt.where(Recipe.is_dietetic.is_(dietetic))
    condition = search_condition(q)
    if condition is not None:
        stmt = stmt.where(condition)
    column = {
        "updated_at": Recipe.updated_at,
        "title": func.lower(Recipe.title),
        "calories": Recipe.calories,
        "published_at": Recipe.published_at,
    }[sort]
    primary = column.asc() if order == "asc" else column.desc()
    stmt = stmt.order_by(primary.nulls_last(), Recipe.id.desc())
    items, meta = await service.paginate(session, stmt, page, page_size)
    return Page[RecipeAdminRow](items=[recipe_admin_row(r, storage) for r in items], **meta)


@router.post("/recipes", response_model=RecipeAdmin, status_code=201, responses=ERRORS)
async def create_recipe(payload: RecipeCreate, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    return recipe_admin(await service.create_recipe(session, payload), storage)


@router.get("/recipes/{recipe_id}", response_model=RecipeAdmin, responses=ERRORS)
async def get_recipe(recipe_id: int, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    return recipe_admin(await service.load_recipe(session, recipe_id), storage)


@router.patch("/recipes/{recipe_id}", response_model=RecipeAdmin, responses=ERRORS)
async def patch_recipe(recipe_id: int, payload: RecipeUpdate, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    """Utilisé par l'autosave de l'éditeur. Ingrédients et étapes sont remplacés en entier."""
    recipe = await service.load_recipe(session, recipe_id)
    return recipe_admin(await service.update_recipe(session, recipe, payload), storage)


@router.put("/recipes/{recipe_id}", response_model=RecipeAdmin, responses=ERRORS)
async def put_recipe(recipe_id: int, payload: RecipeCreate, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    """Remplace tout le contenu (Cmd+S dans l'éditeur). Ne touche pas à la publication."""
    recipe = await service.load_recipe(session, recipe_id)
    return recipe_admin(await service.update_recipe(session, recipe, payload, replace=True), storage)


async def _update_state(session: SessionDep, storage: StorageDep, recipe_id: int, **changes: bool) -> RecipeAdmin:
    recipe = await service.load_recipe(session, recipe_id)
    return recipe_admin(await service.update_recipe(session, recipe, RecipeUpdate(**changes)), storage)


@router.post("/recipes/{recipe_id}/publish", response_model=RecipeAdmin, responses=ERRORS)
async def publish(recipe_id: int, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    """422 {detail: "incomplete", missing: [...]} s'il manque quelque chose."""
    return await _update_state(session, storage, recipe_id, is_published=True)


@router.post("/recipes/{recipe_id}/unpublish", response_model=RecipeAdmin, responses=ERRORS)
async def unpublish(recipe_id: int, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    return await _update_state(session, storage, recipe_id, is_published=False)


@router.post("/recipes/{recipe_id}/feature", response_model=RecipeAdmin, responses=ERRORS)
async def feature(recipe_id: int, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    return await _update_state(session, storage, recipe_id, is_featured=True)


@router.post("/recipes/{recipe_id}/unfeature", response_model=RecipeAdmin, responses=ERRORS)
async def unfeature(recipe_id: int, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    return await _update_state(session, storage, recipe_id, is_featured=False)


@router.post("/recipes/{recipe_id}/duplicate", response_model=RecipeAdmin, status_code=201, responses=ERRORS)
async def duplicate(recipe_id: int, session: SessionDep, storage: StorageDep) -> RecipeAdmin:
    source = await service.load_recipe(session, recipe_id)
    return recipe_admin(await service.duplicate_recipe(session, source), storage)


@router.delete("/recipes/{recipe_id}", status_code=204, response_class=Response, responses=ERRORS)
async def delete_recipe(recipe_id: int, session: SessionDep) -> Response:
    """Ingrédients et étapes partent avec. L'image reste, voir cleanup-images."""
    recipe = await service.load_recipe(session, recipe_id)
    await session.delete(recipe)
    await session.commit()
    return Response(status_code=204)
