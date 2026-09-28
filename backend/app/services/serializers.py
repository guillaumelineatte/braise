"""Modèles SQLAlchemy -> schémas de réponse."""

from ..images import DEFAULT_VARIANT
from ..models import Image, Recipe
from ..schemas import (
    CategoryBrief,
    ImageOut,
    IngredientLineOut,
    Nutrition,
    NutritionWarning,
    RecipeAdmin,
    RecipeAdminRow,
    RecipeCard,
    RecipeDetail,
    StepOut,
    Thumbnail,
)
from ..storage import Storage
from .nutrition import compute_nutrition, nutrition_warning
from .rules import missing_for_publication, slug_locked


def image_out(image: Image | None, storage: Storage) -> ImageOut | None:
    if image is None:
        return None
    variants = {size: storage.url(path) for size, path in sorted(image.variants.items(), key=lambda kv: int(kv[0]))}
    widths = sorted(int(k) for k in image.variants)
    # petite image : la variante "1600" fait en réalité la largeur de l'original
    srcset = ", ".join(f"{variants[str(w)]} {min(w, image.width)}w" for w in widths)
    return ImageOut(
        id=image.id,
        url=variants.get(DEFAULT_VARIANT) or next(iter(variants.values())),
        variants=variants,
        srcset=srcset,
        lqip=image.lqip,
        width=image.width,
        height=image.height,
        alt=image.alt,
    )


def thumbnail(image: Image | None, storage: Storage) -> Thumbnail | None:
    if image is None:
        return None
    path = image.variants.get("320") or next(iter(image.variants.values()))
    return Thumbnail(url=storage.url(path), lqip=image.lqip)


def category_brief(recipe: Recipe) -> CategoryBrief:
    return CategoryBrief(id=recipe.category.id, name=recipe.category.name, slug=recipe.category.slug)


def recipe_card(recipe: Recipe, storage: Storage) -> RecipeCard:
    return RecipeCard(
        id=recipe.id,
        title=recipe.title,
        slug=recipe.slug,
        description=recipe.description or "",
        category=category_brief(recipe),
        prep_time_minutes=recipe.prep_time_minutes,
        servings=recipe.servings,
        calories=recipe.calories,
        is_dietetic=recipe.is_dietetic,
        is_featured=recipe.is_featured,
        published_at=recipe.published_at,
        image=image_out(recipe.image, storage),
    )


def _lines(recipe: Recipe) -> list[IngredientLineOut]:
    return [
        IngredientLineOut(
            ingredient_id=line.ingredient_id,
            name=line.ingredient.name,
            quantity=line.quantity,
            unit=line.unit,
            position=line.position,
        )
        for line in recipe.ingredients
    ]


def _steps(recipe: Recipe) -> list[StepOut]:
    return [StepOut(id=s.id, position=s.position, content=s.content) for s in recipe.steps]


def _nutrition(recipe: Recipe) -> Nutrition:
    estimated, deviation = compute_nutrition(recipe.calories, recipe.protein_g, recipe.carbs_g, recipe.fat_g)
    return Nutrition(
        calories=recipe.calories,
        protein_g=recipe.protein_g,
        carbs_g=recipe.carbs_g,
        fat_g=recipe.fat_g,
        estimated_calories=estimated,
        deviation_pct=deviation,
    )


def recipe_detail(recipe: Recipe, related: list[Recipe], storage: Storage) -> RecipeDetail:
    card = recipe_card(recipe, storage)
    return RecipeDetail(
        **card.model_dump(),
        updated_at=recipe.updated_at,
        ingredients=_lines(recipe),
        steps=_steps(recipe),
        nutrition=_nutrition(recipe),
        related=[recipe_card(r, storage) for r in related],
    )


def recipe_admin(recipe: Recipe, storage: Storage) -> RecipeAdmin:
    warning = nutrition_warning(recipe.calories, recipe.protein_g, recipe.carbs_g, recipe.fat_g)
    return RecipeAdmin(
        id=recipe.id,
        title=recipe.title,
        slug=recipe.slug,
        slug_locked=slug_locked(recipe),
        description=recipe.description or "",
        category_id=recipe.category_id,
        category=category_brief(recipe),
        prep_time_minutes=recipe.prep_time_minutes,
        servings=recipe.servings,
        image_id=recipe.image_id,
        image=image_out(recipe.image, storage),
        calories=recipe.calories,
        protein_g=recipe.protein_g,
        carbs_g=recipe.carbs_g,
        fat_g=recipe.fat_g,
        is_dietetic=recipe.is_dietetic,
        is_published=recipe.is_published,
        is_featured=recipe.is_featured,
        published_at=recipe.published_at,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
        ingredients=_lines(recipe),
        steps=_steps(recipe),
        nutrition=_nutrition(recipe),
        nutrition_warning=NutritionWarning(estimated=warning[0], deviation_pct=warning[1]) if warning else None,
        missing=missing_for_publication(recipe),
    )


def recipe_admin_row(recipe: Recipe, storage: Storage) -> RecipeAdminRow:
    return RecipeAdminRow(
        id=recipe.id,
        title=recipe.title,
        slug=recipe.slug,
        category=category_brief(recipe),
        is_published=recipe.is_published,
        is_featured=recipe.is_featured,
        is_dietetic=recipe.is_dietetic,
        calories=recipe.calories,
        updated_at=recipe.updated_at,
        published_at=recipe.published_at,
        thumbnail=thumbnail(recipe.image, storage),
    )
