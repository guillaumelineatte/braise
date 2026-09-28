"""Catégories : compteurs publics, gestion dans l'admin, ordre d'affichage."""

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import ApiError, field_error
from ..models import Category, Image, Recipe
from ..schemas import CategoryAdmin, CategoryOut
from ..storage import Storage
from ..text import like_escape, normalize, slugify
from .serializers import image_out


def _dietetic_sum():
    return func.coalesce(func.sum(case((Recipe.is_dietetic.is_(True), 1), else_=0)), 0)


async def public_categories(session: AsyncSession, storage: Storage) -> list[CategoryOut]:
    """Compteurs et vignette ne tiennent compte que des recettes publiées."""
    stmt = (
        select(Category, func.count(Recipe.id), _dietetic_sum())
        .outerjoin(Recipe, and_(Recipe.category_id == Category.id, Recipe.is_published.is_(True)))
        .group_by(Category.id)
        .order_by(Category.position, Category.id)
    )
    rows = (await session.execute(stmt)).all()

    rank = (
        func.row_number()
        .over(partition_by=Recipe.category_id, order_by=(Recipe.published_at.desc(), Recipe.id.desc()))
        .label("rank")
    )
    latest = (
        select(Recipe.category_id.label("category_id"), Recipe.image_id.label("image_id"), rank)
        .where(Recipe.is_published.is_(True), Recipe.image_id.is_not(None))
        .subquery()
    )
    covers = {
        category_id: image
        for category_id, image in (
            await session.execute(
                select(latest.c.category_id, Image).join(Image, Image.id == latest.c.image_id).where(latest.c.rank == 1)
            )
        ).all()
    }
    return [
        CategoryOut(
            id=category.id,
            name=category.name,
            slug=category.slug,
            position=category.position,
            recipe_count=count,
            dietetic_count=int(dietetic),
            cover=image_out(covers.get(category.id), storage),
        )
        for category, count, dietetic in rows
    ]


async def _slug_locked_ids(session: AsyncSession) -> set[int]:
    """Catégories qui ont déjà eu une recette en ligne : on garde leur slug."""
    stmt = select(Recipe.category_id).where(Recipe.published_at.is_not(None)).distinct()
    return set((await session.scalars(stmt)).all())


async def admin_categories(session: AsyncSession) -> list[CategoryAdmin]:
    stmt = (
        select(
            Category,
            func.count(Recipe.id),
            func.coalesce(func.sum(case((Recipe.is_published.is_(True), 1), else_=0)), 0),
            _dietetic_sum(),
        )
        .outerjoin(Recipe, Recipe.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.position, Category.id)
    )
    locked = await _slug_locked_ids(session)
    return [
        CategoryAdmin(
            id=c.id,
            name=c.name,
            slug=c.slug,
            position=c.position,
            recipe_count=total,
            published_count=int(published),
            dietetic_count=int(dietetic),
            slug_locked=c.id in locked,
        )
        for c, total, published, dietetic in (await session.execute(stmt)).all()
    ]


async def admin_category(session: AsyncSession, category_id: int) -> CategoryAdmin:
    for item in await admin_categories(session):
        if item.id == category_id:
            return item
    raise ApiError(404, "Catégorie introuvable.")


async def _unique_category_slug(session: AsyncSession, base: str, exclude_id: int | None = None) -> str:
    base = base or "categorie"
    stmt = select(Category.slug).where(
        or_(Category.slug == base, Category.slug.like(like_escape(base) + "-%", escape="\\"))
    )
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    taken = set((await session.scalars(stmt)).all())
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


async def create_category(session: AsyncSession, name: str) -> Category:
    await _ensure_name_free(session, name)
    position = (await session.scalar(select(func.max(Category.position)))) or 0
    category = Category(name=name, slug=await _unique_category_slug(session, slugify(name)), position=position + 1)
    session.add(category)
    await session.commit()
    return category


async def _ensure_name_free(session: AsyncSession, name: str, exclude_id: int | None = None) -> None:
    """On compare les noms normalisés : 'PLATS' et 'Plats' c'est pareil."""
    rows = await session.execute(select(Category.id, Category.name))
    if any(normalize(other) == normalize(name) for cid, other in rows.all() if cid != exclude_id):
        raise field_error("name", "Une catégorie porte déjà ce nom.")


async def rename_category(session: AsyncSession, category_id: int, name: str) -> Category:
    category = await session.get(Category, category_id)
    if category is None:
        raise ApiError(404, "Catégorie introuvable.")
    await _ensure_name_free(session, name, exclude_id=category.id)
    category.name = name
    if category.id not in await _slug_locked_ids(session):
        category.slug = await _unique_category_slug(session, slugify(name), exclude_id=category.id)
    await session.commit()
    return category


async def delete_category(session: AsyncSession, category_id: int) -> None:
    category = await session.get(Category, category_id)
    if category is None:
        raise ApiError(404, "Catégorie introuvable.")
    count = await session.scalar(select(func.count()).where(Recipe.category_id == category_id)) or 0
    if count:
        plural = "recettes y sont rattachées" if count > 1 else "recette y est rattachée"
        raise ApiError(
            409,
            f"{count} {plural} : déplacez-les vers une autre catégorie avant de supprimer celle-ci.",
            recipe_count=count,
        )
    await session.delete(category)
    await session.commit()


async def reorder_categories(session: AsyncSession, ids: list[int]) -> None:
    categories = {c.id: c for c in (await session.scalars(select(Category))).all()}
    if len(ids) != len(set(ids)) or set(ids) != set(categories):
        raise field_error("ids", "La liste doit contenir chaque catégorie une seule fois.")
    for position, category_id in enumerate(ids, start=1):
        categories[category_id].position = position
    await session.commit()
