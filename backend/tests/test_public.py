from conftest import create_published


async def test_unpublished_recipes_are_invisible(client, auth, categories):
    published = await create_published(client, auth, categories["plats"], title="Visible")
    draft = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Invisible"})).json()
    hidden = await create_published(client, auth, categories["plats"], title="Retirée")
    await client.post(f"/api/admin/recipes/{hidden['id']}/unpublish", headers=auth)

    listing = (await client.get("/api/recipes")).json()
    assert [r["title"] for r in listing["items"]] == ["Visible"]
    assert listing["total"] == 1
    assert (await client.get(f"/api/recipes/{published['slug']}")).status_code == 200
    for slug in (draft["slug"], hidden["slug"], "inexistante"):
        response = await client.get(f"/api/recipes/{slug}")
        assert response.status_code == 404
    searched = (await client.get("/api/recipes", params={"q": "invisible"})).json()
    assert searched["total"] == 0


async def test_recipe_detail_shape(client, auth, categories):
    recipe = await create_published(client, auth, categories["plats"])
    detail = (await client.get(f"/api/recipes/{recipe['slug']}")).json()
    assert detail["category"] == {"id": categories["plats"], "name": "Plats", "slug": "plats"}
    assert [i["name"] for i in detail["ingredients"]] == ["Lentilles corail", "Carotte", "Lait de coco"]
    assert detail["ingredients"][0] == {
        "ingredient_id": detail["ingredients"][0]["ingredient_id"],
        "name": "Lentilles corail",
        "quantity": 200,
        "unit": "G",
        "position": 1,
    }
    assert detail["nutrition"] == {
        "calories": 250,
        "protein_g": 14,
        "carbs_g": 35,
        "fat_g": 6,
        "estimated_calories": 250,
        "deviation_pct": 0.0,
    }
    image = detail["image"]
    assert set(image["variants"]) == {"320", "800", "1600"}
    assert image["srcset"].count("w,") == 2 and image["lqip"].startswith("data:image/webp;base64,")
    assert "missing" not in detail and "nutrition_warning" not in detail


async def test_filters_and_sorting(client, auth, categories):
    await create_published(
        client,
        auth,
        categories["plats"],
        title="Aligot",
        calories=600,
        protein_g=20,
        carbs_g=50,
        fat_g=35,
        prep_time_minutes=45,
    )
    await create_published(
        client,
        auth,
        categories["plats"],
        title="Ratatouille",
        is_dietetic=True,
        calories=180,
        protein_g=4,
        carbs_g=20,
        fat_g=9,
        prep_time_minutes=90,
    )
    await create_published(client, auth, categories["entrees"], title="Velouté", is_dietetic=True, calories=250)

    def titles(response):
        return [r["title"] for r in response.json()["items"]]

    assert titles(await client.get("/api/recipes")) == ["Velouté", "Ratatouille", "Aligot"]
    assert titles(await client.get("/api/recipes", params={"order": "asc"})) == ["Aligot", "Ratatouille", "Velouté"]
    assert titles(await client.get("/api/recipes", params={"category": "plats"})) == ["Ratatouille", "Aligot"]
    assert titles(await client.get("/api/recipes", params={"category": "plats", "dietetic": "true"})) == ["Ratatouille"]
    assert titles(await client.get("/api/recipes", params={"dietetic": "true"})) == ["Velouté", "Ratatouille"]
    assert titles(await client.get("/api/recipes", params={"dietetic": "false"})) == ["Aligot"]
    assert titles(await client.get("/api/recipes", params={"max_prep_time": 45})) == ["Velouté", "Aligot"]
    assert titles(await client.get("/api/recipes", params={"sort": "calories", "order": "asc"})) == [
        "Ratatouille",
        "Velouté",
        "Aligot",
    ]
    assert titles(await client.get("/api/recipes", params={"sort": "calories"})) == ["Aligot", "Velouté", "Ratatouille"]
    assert titles(await client.get("/api/recipes", params={"category": "pains"})) == []


async def test_pagination(client, auth, categories):
    for n in range(5):
        await create_published(client, auth, categories["plats"], title=f"Recette {n}")
    page = (await client.get("/api/recipes", params={"page": 2, "page_size": 2})).json()
    assert page["total"] == 5 and page["pages"] == 3 and page["page"] == 2 and page["page_size"] == 2
    assert [r["title"] for r in page["items"]] == ["Recette 2", "Recette 1"]
    assert (await client.get("/api/recipes", params={"page_size": 49})).status_code == 422
    empty = (await client.get("/api/recipes", params={"category": "pains"})).json()
    assert empty == {"items": [], "total": 0, "page": 1, "page_size": 12, "pages": 0}


async def test_search_title_description_and_ingredients(client, auth, categories):
    await create_published(
        client,
        auth,
        categories["plats"],
        title="Crème brûlée",
        description="Un classique à la vanille.",
        ingredients=[{"name": "Jaunes d'œufs", "quantity": 6, "unit": "UNIT"}],
    )
    await create_published(
        client,
        auth,
        categories["plats"],
        title="Gratin",
        description="Pommes de terre et crème.",
        ingredients=[{"name": "Gruyère", "quantity": 100, "unit": "G"}],
    )

    async def search(q):
        return sorted(r["title"] for r in (await client.get("/api/recipes", params={"q": q})).json()["items"])

    assert await search("creme") == ["Crème brûlée", "Gratin"]  # titre + description, sans accents
    assert await search("BRULEE") == ["Crème brûlée"]
    assert await search("oeufs") == ["Crème brûlée"]  # nom d'ingrédient, ligature
    assert await search("gruyere") == ["Gratin"]
    assert await search("crème vanille") == ["Crème brûlée"]  # tous les termes
    assert await search("la crème") == ["Crème brûlée", "Gratin"]  # mots vides ignorés
    assert await search("100%_") == []


async def test_category_counts_only_published(client, auth, categories):
    await create_published(client, auth, categories["plats"], title="Aligot")
    await create_published(client, auth, categories["plats"], title="Ratatouille", is_dietetic=True)
    await create_published(client, auth, categories["entrees"], title="Velouté", is_dietetic=True)
    await client.post(
        "/api/admin/recipes", headers=auth, json={"title": "Brouillon", "category_id": categories["plats"]}
    )
    retired = await create_published(client, auth, categories["pains"], title="Retiré", is_dietetic=True)
    await client.post(f"/api/admin/recipes/{retired['id']}/unpublish", headers=auth)

    response = await client.get("/api/categories")
    assert response.headers["cache-control"] == "public, max-age=60, stale-while-revalidate=300"
    counts = {c["slug"]: (c["recipe_count"], c["dietetic_count"]) for c in response.json()}
    assert counts == {"entrees": (1, 1), "plats": (2, 1), "patisserie": (0, 0), "pains": (0, 0), "aperitif": (0, 0)}
    by_slug = {c["slug"]: c for c in response.json()}
    assert [c["slug"] for c in response.json()] == ["entrees", "plats", "patisserie", "pains", "aperitif"]
    assert by_slug["plats"]["cover"]["id"] is not None
    assert by_slug["pains"]["cover"] is None


async def test_related_recipes(client, auth, categories):
    light = await create_published(client, auth, categories["plats"], title="Courgettes farcies", is_dietetic=True)
    await create_published(client, auth, categories["plats"], title="Ratatouille", is_dietetic=True)
    await create_published(client, auth, categories["plats"], title="Aligot")
    await create_published(client, auth, categories["plats"], title="Cassoulet")
    await create_published(client, auth, categories["entrees"], title="Velouté", is_dietetic=True)
    draft = (
        await client.post(
            "/api/admin/recipes", headers=auth, json={"title": "Tian", "category_id": categories["plats"]}
        )
    ).json()

    related = (await client.get(f"/api/recipes/{light['slug']}")).json()["related"]
    # diététiques d'abord, puis par date. Pas la recette elle-même, pas de brouillon.
    assert [r["title"] for r in related] == ["Ratatouille", "Cassoulet", "Aligot"]
    assert draft["id"] not in {r["id"] for r in related}

    # seule dans sa catégorie : on complète avec les autres
    velvet = (await client.get("/api/recipes/veloute")).json()["related"]
    assert [r["title"] for r in velvet] == ["Ratatouille", "Courgettes farcies", "Cassoulet"]


async def test_ingredient_autocomplete(client, auth, categories):
    names = ["Tomates cerises", "Tomate", "Coulis de tomate", "Crème fraîche", "Crémant", "Échalote"] + [
        f"Tomme {n}" for n in range(10)
    ]
    await client.post(
        "/api/admin/recipes",
        headers=auth,
        json={"title": "Réserve", "ingredients": [{"name": n, "quantity": 1, "unit": "UNIT"} for n in names]},
    )
    assert await _suggest(client, "crem") == ["Crémant", "Crème fraîche"]
    assert await _suggest(client, "ECHA") == ["Échalote"]
    tom = await _suggest(client, "tom")
    assert len(tom) == 10 and tom[:2] == ["Tomate", "Tomates cerises"]
    assert await _suggest(client, "tomate") == ["Tomate", "Tomates cerises", "Coulis de tomate"]
    assert await _suggest(client, "") == []


async def _suggest(client, q):
    response = await client.get("/api/ingredients", params={"q": q})
    assert response.status_code == 200
    return response.json()


async def test_cache_headers_and_cors(client, auth, categories):
    public = await client.get("/api/recipes", headers={"Origin": "http://front.test"})
    assert public.headers["cache-control"] == "public, max-age=60, stale-while-revalidate=300"
    assert public.headers["access-control-allow-origin"] == "http://front.test"
    admin = await client.get("/api/admin/recipes", headers=auth)
    assert admin.headers["cache-control"] == "no-store"
    missing = await client.get("/api/recipes/inexistante")
    assert missing.headers["cache-control"] == "no-cache"
    foreign = await client.get("/api/recipes", headers={"Origin": "http://ailleurs.test"})
    assert "access-control-allow-origin" not in foreign.headers
    assert public.headers["x-request-id"]


async def test_sitemap_lists_published_recipes(client, auth, categories):
    await create_published(client, auth, categories["plats"], title="Aligot")
    await client.post("/api/admin/recipes", headers=auth, json={"title": "Brouillon secret"})
    for path in ("/sitemap.xml", "/api/sitemap.xml"):
        response = await client.get(path)
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/xml")
        assert "<loc>https://braise.test/recettes/aligot</loc>" in response.text
        assert "https://braise.test/recettes?category=plats" in response.text
        assert "brouillon" not in response.text


async def test_media_is_served_with_long_cache(client, auth, categories):
    recipe = await create_published(client, auth, categories["plats"])
    url = recipe["image"]["variants"]["800"]
    assert url.startswith("/media/images/")
    response = await client.get(url)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


async def test_robots_points_to_absolute_sitemap(client):
    response = await client.get("/robots.txt")
    assert response.status_code == 200
    assert "Sitemap: https://braise.test/sitemap.xml" in response.text
    assert "Disallow: /admin" in response.text
