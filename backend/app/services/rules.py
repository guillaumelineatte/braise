"""Règles métier qui n'ont pas besoin de la base : complétude, verrou du slug."""

import re

from ..models import Recipe
from ..text import slugify
from .nutrition import BLOCK_DEVIATION_PCT, compute_nutrition

# Même ordre que les sections de l'éditeur : le front scrolle vers le premier manque.
PUBLICATION_FIELDS = (
    "title",
    "description",
    "category_id",
    "prep_time_minutes",
    "servings",
    "image_id",
    "ingredients",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "nutrition_coherence",
    "steps",
)

MISSING_MESSAGES = {
    "title": "Donnez un titre à la recette.",
    "description": "Ajoutez une description.",
    "category_id": "Choisissez une catégorie.",
    "prep_time_minutes": "Indiquez le temps de préparation.",
    "servings": "Indiquez le nombre de portions.",
    "image_id": "Ajoutez une image.",
    "ingredients": "Ajoutez au moins un ingrédient.",
    "calories": "Renseignez les calories.",
    "protein_g": "Renseignez les protéines.",
    "carbs_g": "Renseignez les glucides.",
    "fat_g": "Renseignez les lipides.",
    "nutrition_coherence": "Les macros et les calories divergent de plus de 40 % : vérifiez la saisie.",
    "steps": "Ajoutez au moins une étape.",
}


def missing_for_publication(recipe: Recipe) -> list[str]:
    """Ce qui empêche de publier. Liste vide = on peut publier."""
    missing: set[str] = set()
    if not (recipe.title or "").strip():
        missing.add("title")
    if not (recipe.description or "").strip():
        missing.add("description")
    if recipe.category_id is None:
        missing.add("category_id")
    if not recipe.prep_time_minutes or recipe.prep_time_minutes <= 0:
        missing.add("prep_time_minutes")
    if not recipe.servings or recipe.servings <= 0:
        missing.add("servings")
    if recipe.image_id is None:
        missing.add("image_id")
    if not recipe.ingredients:
        missing.add("ingredients")
    if not recipe.steps:
        missing.add("steps")
    if recipe.calories is None or recipe.calories <= 0:
        missing.add("calories")
    for field in ("protein_g", "carbs_g", "fat_g"):
        if getattr(recipe, field) is None:
            missing.add(field)
    _, deviation = compute_nutrition(recipe.calories, recipe.protein_g, recipe.carbs_g, recipe.fat_g)
    if deviation is not None and abs(deviation) > BLOCK_DEVIATION_PCT:
        missing.add("nutrition_coherence")
    return [f for f in PUBLICATION_FIELDS if f in missing]


def missing_errors(missing: list[str]) -> list[dict[str, str]]:
    return [{"field": f, "message": MISSING_MESSAGES[f]} for f in missing]


def slug_locked(recipe: Recipe) -> bool:
    """Une fois publiée, l'URL a pu être partagée : on ne touche plus au slug."""
    return recipe.published_at is not None


def is_auto_slug(slug: str, title: str) -> bool:
    """True si le slug est encore celui généré depuis le titre (avec ou sans -2, -3...)."""
    base = slugify(title) or "recette"
    return slug == base or re.fullmatch(re.escape(base) + r"-\d+", slug) is not None
