"""Données de démo (python -m app.cli seed).

En attendant de vraies photos, les images sont des dégradés générés avec Pillow, dans les
couleurs du prototype, avec un peu de grain. Elles passent par le même traitement que les
uploads, donc on a bien les variantes WebP et le LQIP.
"""

from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from PIL import Image as PILImage
from PIL import ImageChops
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import utcnow
from .images import store_image
from .models import Category, Recipe, RecipeIngredient, Step, Unit
from .seed_data import CATEGORIES, RECIPES, SeedRecipe
from .services.recipes import resolve_ingredients, unique_slug
from .services.rules import missing_for_publication
from .storage import Storage
from .text import normalize, slugify

RGB = tuple[int, int, int]

# couleurs --photo-a à --photo-d + accents (thème clair)
PHOTO: dict[str, RGB] = {
    "a": (0xD9, 0xC9, 0xAE),
    "b": (0xB9, 0x9F, 0x7C),
    "c": (0x8B, 0x74, 0x55),
    "d": (0x5E, 0x4B, 0x36),
}
TINTS: dict[str, RGB] = {"accent": (0xB4, 0x55, 0x2D), "ocre": (0xC9, 0xA2, 0x4A), "olive": (0x6F, 0x7A, 0x4B)}

# les dégradés du prototype : (rayons x/y, centre, arrêts de couleur), en fraction de l'image
VARIANTS: dict[str, tuple[tuple[float, float], tuple[float, float], list[tuple[float, str]]]] = {
    "base": ((1.2, 0.9), (0.30, 0.20), [(0, "a"), (0.45, "b"), (0.80, "c"), (1, "d")]),
    "b": ((1.1, 1.0), (0.70, 0.80), [(0, "a"), (0.60, "c"), (1, "d")]),
    "c": ((0.9, 0.9), (0.50, 0.40), [(0, "b"), (0.55, "c"), (1, "d")]),
    "d": ((1.3, 0.8), (0.20, 0.70), [(0, "a"), (0.50, "b"), (1, "d")]),
    "hero": ((1.1, 1.0), (0.65, 0.35), [(0, "a"), (0.40, "b"), (0.75, "c"), (1, "d")]),
}


def _mix(a: RGB, b: RGB, t: float) -> RGB:
    return (round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t), round(a[2] + (b[2] - a[2]) * t))


def _lut(stops: list[tuple[float, RGB]]) -> list[int]:
    colors: list[RGB] = []
    for i in range(256):
        t = i / 255
        for (p0, c0), (p1, c1) in zip(stops, stops[1:], strict=False):
            if p0 <= t <= p1:
                colors.append(_mix(c0, c1, (t - p0) / (p1 - p0) if p1 > p0 else 0))
                break
        else:
            colors.append(stops[-1][1])
    return [c[0] for c in colors] + [c[1] for c in colors] + [c[2] for c in colors]


def placeholder_image(variant: str = "base", tint: str = "none", *, size: tuple[int, int] = (2000, 1600)) -> bytes:
    """Fausse photo : dégradé radial + grain, comme les blocs .photo du prototype."""
    width, height = size
    (rx, ry), (cx, cy), stops = VARIANTS[variant]
    palette = PHOTO
    if tint in TINTS:
        palette = {k: _mix(v, TINTS[tint], 0.14) for k, v in PHOTO.items()}
    lut = _lut([(p, palette[k]) for p, k in stops])

    # radial_gradient() donne du 256x256, 0 au centre et 255 sur le bord
    ellipse = PILImage.radial_gradient("L").resize(
        (max(2, round(2 * rx * width)), max(2, round(2 * ry * height))), PILImage.Resampling.BICUBIC
    )
    field = PILImage.new("L", size, 255)
    field.paste(ellipse, (round(cx * width - ellipse.width / 2), round(cy * height - ellipse.height / 2)))
    img = field.convert("RGB").point(lut)

    # Grain léger. Tiré en demi-résolution puis agrandi, sinon le WebP 1600 pèse 500 Ko.
    noise = (
        PILImage.effect_noise((width // 2, height // 2), 64)
        .point(lambda v: 128 + round((v - 128) * 0.12))
        .resize(size, PILImage.Resampling.BILINEAR)
    )
    img = ImageChops.add(img, PILImage.merge("RGB", (noise, noise, noise)), scale=1.0, offset=-128)

    buffer = BytesIO()
    img.save(buffer, "JPEG", quality=88, optimize=True)
    return buffer.getvalue()


def _dec(value: float | None) -> Decimal | None:
    return None if value is None else Decimal(str(value))


async def ensure_categories(session: AsyncSession) -> dict[str, Category]:
    existing = {c.slug: c for c in (await session.scalars(select(Category))).all()}
    for position, (name, slug) in enumerate(CATEGORIES, start=1):
        if slug not in existing:
            category = Category(name=name, slug=slug, position=position)
            session.add(category)
            existing[slug] = category
    await session.flush()
    return existing


async def _create_recipe(
    session: AsyncSession, storage: Storage, data: SeedRecipe, category: Category, index: int
) -> Recipe:
    image = await store_image(
        session,
        storage,
        placeholder_image(data.image_variant, data.image_tint),
        alt=data.alt,
    )
    published_at = utcnow() - timedelta(days=data.published_days_ago, hours=index)
    recipe = Recipe(
        title=data.title,
        slug=await unique_slug(session, slugify(data.title)),
        description=data.description,
        category=category,
        prep_time_minutes=data.prep_time_minutes,
        servings=data.servings,
        image=image,
        calories=_dec(data.calories),
        protein_g=_dec(data.protein_g),
        carbs_g=_dec(data.carbs_g),
        fat_g=_dec(data.fat_g),
        is_dietetic=data.is_dietetic,
        is_published=True,
        is_featured=False,
        published_at=published_at,
        created_at=published_at - timedelta(days=2),
        updated_at=published_at,
    )
    by_norm = await resolve_ingredients(session, [name for name, _, _ in data.ingredients])
    recipe.ingredients = [
        RecipeIngredient(position=i, ingredient=by_norm[normalize(name)], quantity=_dec(qty), unit=Unit(unit))
        for i, (name, qty, unit) in enumerate(data.ingredients, start=1)
    ]
    recipe.steps = [Step(position=i, content=content) for i, content in enumerate(data.steps, start=1)]
    session.add(recipe)
    await session.flush()
    missing = missing_for_publication(recipe)
    if missing:
        raise RuntimeError(f"Recette de démonstration incomplète « {data.title} » : {missing}")
    return recipe


async def seed(session: AsyncSession, storage: Storage, *, reset: bool = False) -> dict[str, int]:
    """Peut être relancé sans risque : une recette qui existe déjà (même titre) est ignorée."""
    if reset:
        await session.execute(delete(Recipe))
        await session.flush()
    categories = await ensure_categories(session)
    existing_titles = set((await session.scalars(select(Recipe.title))).all())

    created = 0
    featured: Recipe | None = None
    for index, data in enumerate(RECIPES):
        if data.title in existing_titles:
            continue
        recipe = await _create_recipe(session, storage, data, categories[data.category], index)
        created += 1
        if data.is_featured:
            featured = recipe

    if featured is not None and not await session.scalar(
        select(Recipe.id).where(Recipe.is_featured.is_(True)).limit(1)
    ):
        featured.is_featured = True
    await session.commit()
    return {"categories": len(categories), "recipes_created": created}
