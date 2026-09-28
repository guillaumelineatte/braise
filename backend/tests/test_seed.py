from collections import Counter
from pathlib import Path

from app.seed import placeholder_image, seed
from app.seed_data import RECIPES


async def test_seed_creates_a_coherent_catalogue(app, client, settings):
    async with app.state.sessionmaker() as session:
        result = await seed(session, app.state.storage)
    assert result == {"categories": 5, "recipes_created": 10}

    categories = (await client.get("/api/categories")).json()
    assert [c["name"] for c in categories] == ["Entrées", "Plats", "Pâtisserie", "Pains", "Apéritif"]
    assert all(c["recipe_count"] == 2 and c["dietetic_count"] == 1 for c in categories)
    assert all(c["cover"] is not None for c in categories)

    listing = (await client.get("/api/recipes", params={"page_size": 48})).json()
    assert listing["total"] == 10
    featured = (await client.get("/api/recipes/featured")).json()
    assert featured["is_featured"] is True
    assert featured["title"] == "Bouillon de champignons et sarrasin grillé"
    assert sum(r["is_featured"] for r in listing["items"]) == 1

    for card in listing["items"]:
        detail = (await client.get(f"/api/recipes/{card['slug']}")).json()
        assert abs(detail["nutrition"]["deviation_pct"]) < 15, detail["title"]
        assert len(detail["ingredients"]) >= 5 and len(detail["steps"]) >= 5
        assert len(detail["related"]) == 3
        for size, url in detail["image"]["variants"].items():
            assert (Path(settings.media_root) / url.removeprefix("/media/")).is_file(), size
        assert detail["image"]["lqip"].startswith("data:image/webp;base64,")
        for step in detail["steps"]:
            assert " :" not in step["content"], "espace insécable attendue avant les deux-points"

    # on relance : rien ne doit être créé en double
    async with app.state.sessionmaker() as session:
        again = await seed(session, app.state.storage)
    assert again == {"categories": 5, "recipes_created": 0}


def test_seed_data_is_balanced():
    per_category = Counter(r.category for r in RECIPES)
    assert set(per_category.values()) == {2}
    assert Counter(r.category for r in RECIPES if r.is_dietetic) == Counter({c: 1 for c in per_category})
    assert sum(r.is_featured for r in RECIPES) == 1
    for recipe in RECIPES:
        estimated = 4 * recipe.protein_g + 4 * recipe.carbs_g + 9 * recipe.fat_g
        assert abs(estimated - recipe.calories) / recipe.calories < 0.15, recipe.title
        assert 1 <= recipe.servings <= 24


def test_placeholder_is_a_gradient():
    from io import BytesIO

    from PIL import Image as PILImage

    image = PILImage.open(BytesIO(placeholder_image("base")))
    assert image.size == (2000, 1600)
    light = image.getpixel((600, 320))  # près du centre du dégradé (30 %, 20 %)
    dark = image.getpixel((1990, 1590))
    assert sum(light) > sum(dark) + 150
