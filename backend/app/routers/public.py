"""Routes publiques, en lecture seule. Les brouillons n'en sortent jamais."""

from typing import Annotated, Literal
from xml.sax.saxutils import escape

from fastapi import APIRouter, Query, Response
from sqlalchemy import case, or_, select

from ..errors import ApiError
from ..models import Category, Ingredient, Recipe
from ..schemas import CategoryOut, ErrorOut, Page, RecipeCard, RecipeDetail
from ..services import recipes as recipe_service
from ..services.categories import public_categories
from ..services.serializers import recipe_card, recipe_detail
from ..text import like_escape, normalize
from .deps import SessionDep, SettingsDep, StorageDep

router = APIRouter(tags=["Public"])


@router.get("/recipes", response_model=Page[RecipeCard], summary="Liste des recettes publiées")
async def list_recipes(
    session: SessionDep,
    storage: StorageDep,
    category: Annotated[str | None, Query(description="Slug de catégorie")] = None,
    dietetic: bool | None = None,
    max_prep_time: Annotated[int | None, Query(ge=1, description="En minutes")] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    sort: Literal["date", "calories"] = "date",
    order: Literal["asc", "desc"] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=48)] = 12,
) -> Page[RecipeCard]:
    stmt = recipe_service.public_recipes_query(
        category=category, dietetic=dietetic, max_prep_time=max_prep_time, q=q, sort=sort, order=order
    )
    items, meta = await recipe_service.paginate(session, stmt, page, page_size)
    return Page[RecipeCard](items=[recipe_card(r, storage) for r in items], **meta)


@router.get(
    "/recipes/featured",
    response_model=RecipeCard,
    summary="Recette mise en avant (à défaut, la dernière publiée)",
    responses={404: {"model": ErrorOut}},
)
async def featured(session: SessionDep, storage: StorageDep) -> RecipeCard:
    recipe = await recipe_service.featured_recipe(session)
    if recipe is None:
        raise ApiError(404, "Aucune recette publiée.")
    return recipe_card(recipe, storage)


@router.get(
    "/recipes/{slug}",
    response_model=RecipeDetail,
    summary="Détail d'une recette publiée",
    responses={404: {"model": ErrorOut}},
)
async def recipe_by_slug(slug: str, session: SessionDep, storage: StorageDep) -> RecipeDetail:
    recipe = await recipe_service.load_published_by_slug(session, slug)
    related = await recipe_service.related_recipes(session, recipe)
    return recipe_detail(recipe, related, storage)


@router.get("/categories", response_model=list[CategoryOut], summary="Catégories et compteurs publics")
async def categories(session: SessionDep, storage: StorageDep) -> list[CategoryOut]:
    return await public_categories(session, storage)


@router.get("/ingredients", response_model=list[str], summary="Autocomplétion des ingrédients")
async def ingredients(
    session: SessionDep,
    q: Annotated[str, Query(max_length=80)] = "",
) -> list[str]:
    norm = normalize(q)
    if not norm:
        return []
    prefix = like_escape(norm) + "%"
    word = "% " + like_escape(norm) + "%"
    starts = Ingredient.normalized_name.like(prefix, escape="\\")
    stmt = (
        select(Ingredient.name)
        .where(or_(starts, Ingredient.normalized_name.like(word, escape="\\")))
        .order_by(case((starts, 0), else_=1), Ingredient.normalized_name)
        .limit(10)
    )
    return list((await session.scalars(stmt)).all())


sitemap_router = APIRouter(tags=["Public"])


@sitemap_router.get("/sitemap.xml", response_class=Response, summary="Plan du site (recettes publiées)")
async def sitemap(session: SessionDep, settings: SettingsDep) -> Response:
    base = settings.site_url.rstrip("/")
    urls: list[tuple[str, str | None]] = [(f"{base}/", None), (f"{base}/recettes", None), (f"{base}/a-propos", None)]
    for slug in (await session.scalars(select(Category.slug).order_by(Category.position))).all():
        urls.append((f"{base}/recettes?category={slug}", None))
    rows = await session.execute(
        select(Recipe.slug, Recipe.updated_at).where(Recipe.is_published.is_(True)).order_by(Recipe.published_at.desc())
    )
    for slug, updated_at in rows.all():
        urls.append((f"{base}/recettes/{slug}", updated_at.date().isoformat()))
    body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in urls:
        body.append(
            f"  <url><loc>{escape(loc)}</loc>" + (f"<lastmod>{lastmod}</lastmod>" if lastmod else "") + "</url>"
        )
    body.append("</urlset>")
    return Response("\n".join(body), media_type="application/xml")


@sitemap_router.get("/robots.txt", response_class=Response, summary="Consignes pour les robots")
async def robots(settings: SettingsDep) -> Response:
    base = settings.site_url.rstrip("/")
    body = f"User-agent: *\nDisallow: /admin\nDisallow: /api/admin\n\nSitemap: {base}/sitemap.xml\n"
    return Response(body, media_type="text/plain")
