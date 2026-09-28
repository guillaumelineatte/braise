"""Recherche dans le titre, la description et les ingrédients, sans tenir compte des accents.

SQLite : fonction maison braise_norm + LIKE.
Postgres : unaccent + pg_trgm si les extensions sont là, sinon translate() + ILIKE.
"""

from sqlalchemy import ColumnElement, and_, exists, func, or_

from ..db import search_caps
from ..models import Ingredient, Recipe, RecipeIngredient
from ..text import like_escape, normalize

_STOPWORDS = {"a", "au", "aux", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les", "un", "une"}
TRIGRAM_THRESHOLD = 0.5
_ACCENTED = "àâäáãåçéèêëíìîïñóòôöõúùûüýÿ"
_PLAIN = "aaaaaaceeeeiiiinooooouuuuyy"


def _terms(query: str) -> list[str]:
    """Mots de la recherche, sans accents ni mots vides (sauf s'il n'y a que ça)."""
    terms = normalize(query.replace("'", " ").replace("’", " ")).split()
    return [t for t in terms if len(t) > 1 and t not in _STOPWORDS] or terms


def _normalized(column: ColumnElement[str]) -> ColumnElement[str]:
    if search_caps.dialect == "sqlite":
        return func.braise_norm(column)
    if search_caps.unaccent:
        return func.unaccent(func.lower(column))
    folded = func.translate(func.lower(column), _ACCENTED, _PLAIN)
    return func.replace(func.replace(folded, "œ", "oe"), "æ", "ae")


def _term_condition(term: str) -> ColumnElement[bool]:
    pattern = f"%{like_escape(term)}%"
    in_ingredients = exists().where(
        RecipeIngredient.recipe_id == Recipe.id,
        Ingredient.id == RecipeIngredient.ingredient_id,
        Ingredient.normalized_name.like(pattern, escape="\\"),
    )
    conditions: list[ColumnElement[bool]] = [
        _normalized(Recipe.title).ilike(pattern, escape="\\"),
        _normalized(Recipe.description).ilike(pattern, escape="\\"),
        in_ingredients,
    ]
    if search_caps.dialect == "postgresql" and search_caps.unaccent and search_caps.trigram and len(term) >= 4:
        # pour les fautes de frappe ("risoto" -> "risotto")
        conditions.append(func.word_similarity(term, _normalized(Recipe.title)) >= TRIGRAM_THRESHOLD)
    return or_(*conditions)


def search_condition(query: str | None) -> ColumnElement[bool] | None:
    """Chaque mot doit apparaître dans au moins un des champs."""
    if not query:
        return None
    terms = _terms(query)
    if not terms:
        return None
    return and_(*(_term_condition(term) for term in terms))
