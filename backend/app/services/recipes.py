"""Tout ce qui touche aux recettes : création, modif, publication, requêtes publiques."""

import math
from typing import Literal

from sqlalchemy import Select, case, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import utcnow
from ..errors import ApiError, field_error
from ..models import Category, Image, Ingredient, Recipe, RecipeIngredient, Step
from ..schemas import IngredientLineIn, RecipeCreate, RecipeUpdate, StepIn
from ..text import like_escape, normalize, slugify
from .rules import is_auto_slug, missing_errors, missing_for_publication, slug_locked
from .search import search_condition

FULL = (selectinload(Recipe.ingredients), selectinload(Recipe.steps))
COPY_SUFFIX = " (copie)"

SCALAR_FIELDS = (
    "description",
    "prep_time_minutes",
    "servings",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "is_dietetic",
)


# ---------------------------------------------------------------- chargement


async def load_recipe(session: AsyncSession, recipe_id: int) -> Recipe:
    stmt = select(Recipe).options(*FULL).where(Recipe.id == recipe_id).execution_options(populate_existing=True)
    recipe = (await session.execute(stmt)).unique().scalar_one_or_none()
    if recipe is None:
        raise ApiError(404, "Recette introuvable.")
    return recipe


async def load_published_by_slug(session: AsyncSession, slug: str) -> Recipe:
    stmt = select(Recipe).options(*FULL).where(Recipe.slug == slug, Recipe.is_published.is_(True))
    recipe = (await session.execute(stmt)).unique().scalar_one_or_none()
    if recipe is None:
        raise ApiError(404, "Recette introuvable.")
    return recipe


# ---------------------------------------------------------------- slugs


async def unique_slug(session: AsyncSession, base: str, *, exclude_id: int | None = None) -> str:
    base = base or "recette"
    stmt = select(Recipe.slug).where(or_(Recipe.slug == base, Recipe.slug.like(like_escape(base) + "-%", escape="\\")))
    if exclude_id is not None:
        stmt = stmt.where(Recipe.id != exclude_id)
    taken = set((await session.scalars(stmt)).all())
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


async def _slug_taken(session: AsyncSession, slug: str, exclude_id: int | None) -> bool:
    stmt = select(Recipe.id).where(Recipe.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Recipe.id != exclude_id)
    return (await session.scalar(stmt.limit(1))) is not None


# ---------------------------------------------------------------- ingrédients et étapes


def _display_name(name: str) -> str:
    name = " ".join(name.split())
    return name[:1].upper() + name[1:]


async def resolve_ingredients(session: AsyncSession, names: list[str]) -> dict[str, Ingredient]:
    """Réutilise l'ingrédient s'il existe déjà ("tomate" = "Tomate"), sinon le crée."""
    wanted: dict[str, str] = {}
    for name in names:
        wanted.setdefault(normalize(name), name)
    if not wanted:
        return {}
    existing = await session.scalars(select(Ingredient).where(Ingredient.normalized_name.in_(wanted)))
    by_norm = {i.normalized_name: i for i in existing}
    for norm, name in wanted.items():
        if norm not in by_norm:
            ingredient = Ingredient(name=_display_name(name), normalized_name=norm)
            session.add(ingredient)
            by_norm[norm] = ingredient
    await session.flush()
    return by_norm


async def replace_ingredients(session: AsyncSession, recipe: Recipe, lines: list[IngredientLineIn]) -> None:
    """On remplace toute la liste dans l'ordre reçu, plus simple qu'un diff."""
    by_norm = await resolve_ingredients(session, [line.name for line in lines])
    recipe.ingredients.clear()
    await session.flush()
    for position, line in enumerate(lines, start=1):
        recipe.ingredients.append(
            RecipeIngredient(
                position=position,
                ingredient=by_norm[normalize(line.name)],
                quantity=line.quantity,
                unit=line.unit,
            )
        )


async def replace_steps(session: AsyncSession, recipe: Recipe, steps: list[StepIn]) -> None:
    recipe.steps.clear()
    await session.flush()
    for position, step in enumerate(steps, start=1):
        recipe.steps.append(Step(position=position, content=step.content))


# ---------------------------------------------------------------- publication et mise en avant


def ensure_complete(recipe: Recipe) -> None:
    missing = missing_for_publication(recipe)
    if missing:
        raise ApiError(422, "incomplete", errors=missing_errors(missing), missing=missing)


def mark_published(recipe: Recipe) -> None:
    ensure_complete(recipe)
    recipe.is_published = True
    if recipe.published_at is None:
        recipe.published_at = utcnow()


def mark_unpublished(recipe: Recipe) -> None:
    recipe.is_published = False
    recipe.is_featured = False


async def set_featured(session: AsyncSession, recipe: Recipe, value: bool) -> None:
    if not value:
        recipe.is_featured = False
        return
    if not recipe.is_published:
        raise field_error(
            "is_featured",
            "Seule une recette publiée peut être mise en avant.",
            detail="not_published",
        )
    # on retire l'ancienne d'abord, sinon l'index unique bloque
    await session.execute(
        update(Recipe)
        .where(Recipe.is_featured.is_(True), Recipe.id != recipe.id)
        .values(is_featured=False)
        .execution_options(synchronize_session="fetch")
    )
    recipe.is_featured = True


# ---------------------------------------------------------------- création et mise à jour


async def default_category_id(session: AsyncSession) -> int:
    category_id = await session.scalar(select(Category.id).order_by(Category.position, Category.id).limit(1))
    if category_id is None:
        raise field_error("category_id", "Créez d'abord une catégorie.")
    return category_id


async def create_recipe(session: AsyncSession, data: RecipeCreate) -> Recipe:
    """Nouveau brouillon. Sans catégorie précisée, on prend la première."""
    if data.category_id is not None:
        category = await session.get(Category, data.category_id)
        if category is None:
            raise field_error("category_id", "Catégorie inconnue.")
    else:
        category = await session.get_one(Category, await default_category_id(session))
    recipe = Recipe(
        title=data.title,
        slug=await unique_slug(session, slugify(data.title) or "recette"),
        description="",
        category=category,
        servings=4,
        is_dietetic=False,
        is_published=False,
        is_featured=False,
    )
    recipe.ingredients = []
    recipe.steps = []
    fields = set(data.model_fields_set) - {"title", "category_id"}
    session.add(recipe)
    await apply_changes(session, recipe, data, fields)
    await session.commit()
    return await load_recipe(session, recipe.id)


async def update_recipe(
    session: AsyncSession,
    recipe: Recipe,
    data: RecipeUpdate | RecipeCreate,
    *,
    replace: bool = False,
) -> Recipe:
    fields = set(type(data).model_fields) if replace else set(data.model_fields_set)
    await apply_changes(session, recipe, data, fields, replace=replace)
    if isinstance(data, RecipeUpdate):
        if "is_published" in fields:
            if data.is_published:
                mark_published(recipe)
            else:
                mark_unpublished(recipe)
        if "is_featured" in fields:
            await set_featured(session, recipe, bool(data.is_featured))
    if recipe.is_published:
        # pas question qu'une recette en ligne se retrouve sans image ou sans étapes
        ensure_complete(recipe)
    recipe.updated_at = utcnow()
    await session.commit()
    return await load_recipe(session, recipe.id)


async def apply_changes(
    session: AsyncSession,
    recipe: Recipe,
    data: RecipeUpdate | RecipeCreate,
    fields: set[str],
    *,
    replace: bool = False,
) -> None:
    errors: list[dict[str, str]] = []

    if "category_id" in fields and data.category_id is not None and data.category_id != recipe.category_id:
        category = await session.get(Category, data.category_id)
        if category is None:
            errors.append({"field": "category_id", "message": "Catégorie inconnue."})
        else:
            recipe.category = category

    if "image_id" in fields and data.image_id != recipe.image_id:
        if data.image_id is None:
            recipe.image = None
        else:
            image = await session.get(Image, data.image_id)
            if image is None:
                errors.append({"field": "image_id", "message": "Image introuvable."})
            else:
                recipe.image = image

    old_title = recipe.title
    if "title" in fields and data.title is not None:
        recipe.title = data.title

    wanted_slug = slugify(data.slug) if "slug" in fields and data.slug is not None else None
    if data.slug is not None and "slug" in fields and not wanted_slug:
        errors.append({"field": "slug", "message": "L'adresse doit contenir au moins une lettre ou un chiffre."})
    elif wanted_slug and wanted_slug != recipe.slug:
        if slug_locked(recipe) and not data.force_slug:
            raise ApiError(
                422,
                "slug_locked",
                errors=[{"field": "slug", "message": "Recette déjà publiée : confirmez pour changer son adresse."}],
            )
        if await _slug_taken(session, wanted_slug, recipe.id):
            errors.append({"field": "slug", "message": "Cette adresse est déjà utilisée par une autre recette."})
        else:
            recipe.slug = wanted_slug
    elif recipe.title != old_title and not slug_locked(recipe) and is_auto_slug(recipe.slug, old_title):
        # le brouillon est créé dès la 1re lettre tapée, donc le slug doit suivre le titre
        recipe.slug = await unique_slug(session, slugify(recipe.title) or "recette", exclude_id=recipe.id)

    for field in SCALAR_FIELDS:
        if field not in fields:
            continue
        value = getattr(data, field)
        if replace and value is None:
            value = {"description": "", "is_dietetic": False}.get(field)
        if field == "description":
            value = value or ""
        if field == "is_dietetic" and value is None:
            continue
        setattr(recipe, field, value)

    if errors:
        raise ApiError(422, "invalid", errors=errors)

    if "ingredients" in fields and (data.ingredients is not None or replace):
        await replace_ingredients(session, recipe, data.ingredients or [])
    if "steps" in fields and (data.steps is not None or replace):
        await replace_steps(session, recipe, data.steps or [])


async def duplicate_recipe(session: AsyncSession, source: Recipe) -> Recipe:
    title = source.title[: 160 - len(COPY_SUFFIX)] + COPY_SUFFIX
    copy = Recipe(
        title=title,
        slug=await unique_slug(session, slugify(title) or "recette"),
        description=source.description,
        category_id=source.category_id,
        prep_time_minutes=source.prep_time_minutes,
        servings=source.servings,
        image_id=source.image_id,
        calories=source.calories,
        protein_g=source.protein_g,
        carbs_g=source.carbs_g,
        fat_g=source.fat_g,
        is_dietetic=source.is_dietetic,
        is_published=False,
        is_featured=False,
        published_at=None,
    )
    copy.ingredients = [
        RecipeIngredient(
            position=line.position, ingredient_id=line.ingredient_id, quantity=line.quantity, unit=line.unit
        )
        for line in source.ingredients
    ]
    copy.steps = [Step(position=step.position, content=step.content) for step in source.steps]
    session.add(copy)
    await session.commit()
    return await load_recipe(session, copy.id)


# ---------------------------------------------------------------- requêtes publiques


PublicSort = Literal["date", "calories"]
Order = Literal["asc", "desc"]


def _paginate_meta(total: int, page: int, page_size: int) -> dict[str, int]:
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)) if total else 0,
    }


async def paginate(
    session: AsyncSession, stmt: Select, page: int, page_size: int
) -> tuple[list[Recipe], dict[str, int]]:
    total = await session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = (await session.execute(stmt.limit(page_size).offset((page - 1) * page_size))).unique().scalars().all()
    return list(rows), _paginate_meta(total, page, page_size)


def public_recipes_query(
    *,
    category: str | None = None,
    dietetic: bool | None = None,
    max_prep_time: int | None = None,
    q: str | None = None,
    sort: PublicSort = "date",
    order: Order = "desc",
) -> Select:
    stmt = select(Recipe).where(Recipe.is_published.is_(True))
    if category:
        stmt = stmt.where(Recipe.category.has(Category.slug == category))
    if dietetic is not None:
        stmt = stmt.where(Recipe.is_dietetic.is_(dietetic))
    if max_prep_time is not None:
        stmt = stmt.where(Recipe.prep_time_minutes <= max_prep_time)
    condition = search_condition(q)
    if condition is not None:
        stmt = stmt.where(condition)
    column = Recipe.calories if sort == "calories" else Recipe.published_at
    primary = column.asc() if order == "asc" else column.desc()
    secondary = Recipe.id.asc() if order == "asc" else Recipe.id.desc()
    return stmt.order_by(primary.nulls_last(), Recipe.published_at.desc(), secondary)


async def featured_recipe(session: AsyncSession) -> Recipe | None:
    published = select(Recipe).where(Recipe.is_published.is_(True))
    recipe = await session.scalar(published.where(Recipe.is_featured.is_(True)).limit(1))
    if recipe is None:
        recipe = await session.scalar(published.order_by(Recipe.published_at.desc(), Recipe.id.desc()).limit(1))
    return recipe


async def related_recipes(session: AsyncSession, recipe: Recipe, limit: int = 3) -> list[Recipe]:
    """3 suggestions : même catégorie, même statut diététique en priorité, puis les plus récentes.

    S'il n'y en a pas assez dans la catégorie, on complète avec les autres.
    """
    ordering = (
        case((Recipe.is_dietetic.is_(recipe.is_dietetic), 0), else_=1),
        Recipe.published_at.desc(),
        Recipe.id.desc(),
    )
    base = select(Recipe).where(Recipe.is_published.is_(True), Recipe.id != recipe.id)
    same = (
        await session.scalars(base.where(Recipe.category_id == recipe.category_id).order_by(*ordering).limit(limit))
    ).all()
    result = list(same)
    if len(result) < limit:
        others = await session.scalars(
            base.where(Recipe.category_id != recipe.category_id).order_by(*ordering).limit(limit - len(result))
        )
        result.extend(others.all())
    return result
