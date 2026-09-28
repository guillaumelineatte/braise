"""Vérifie que openapi.json est à jour (le front compare ses schémas Zod à ce fichier).

Pour le régénérer : python -m app.cli openapi --output openapi.json
"""

import json
from pathlib import Path

from app.main import create_app

OPENAPI_FILE = Path(__file__).resolve().parents[1] / "openapi.json"
REQUIRED_SCHEMAS = {
    "RecipeCard",
    "RecipeDetail",
    "RecipeAdmin",
    "RecipeAdminRow",
    "RecipeCreate",
    "RecipeUpdate",
    "IngredientLineIn",
    "IngredientLineOut",
    "StepIn",
    "StepOut",
    "Nutrition",
    "ImageOut",
    "CategoryOut",
    "CategoryAdmin",
    "Page_RecipeCard_",
    "Page_RecipeAdminRow_",
}


def test_openapi_file_is_up_to_date(settings):
    current = create_app(settings).openapi()
    assert OPENAPI_FILE.exists(), "Lancez : python -m app.cli openapi --output openapi.json"
    stored = json.loads(OPENAPI_FILE.read_text(encoding="utf-8"))
    assert stored["components"]["schemas"] == current["components"]["schemas"], (
        "openapi.json est périmé : python -m app.cli openapi --output openapi.json"
    )
    assert set(stored["paths"]) == set(current["paths"])


def test_required_schema_names(settings):
    schemas = create_app(settings).openapi()["components"]["schemas"]
    assert REQUIRED_SCHEMAS <= set(schemas)


def test_expected_routes(settings):
    paths = create_app(settings).openapi()["paths"]
    for path in (
        "/api/recipes",
        "/api/recipes/featured",
        "/api/recipes/{slug}",
        "/api/categories",
        "/api/ingredients",
        "/api/auth/login",
        "/api/auth/me",
        "/api/admin/dashboard",
        "/api/admin/recipes",
        "/api/admin/recipes/{recipe_id}",
        "/api/admin/recipes/{recipe_id}/publish",
        "/api/admin/recipes/{recipe_id}/unpublish",
        "/api/admin/recipes/{recipe_id}/feature",
        "/api/admin/recipes/{recipe_id}/unfeature",
        "/api/admin/recipes/{recipe_id}/duplicate",
        "/api/admin/uploads",
        "/api/admin/categories",
        "/api/admin/categories/{category_id}",
        "/api/admin/categories/reorder",
    ):
        assert path in paths, path
    assert set(paths["/api/admin/recipes/{recipe_id}"]) == {"get", "patch", "put", "delete"}
