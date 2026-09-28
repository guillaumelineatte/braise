from conftest import complete_payload, create_published, upload_image


async def test_publish_incomplete_lists_missing(client, auth, categories):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Pot-au-feu"})).json()
    response = await client.post(f"/api/admin/recipes/{created['id']}/publish", headers=auth)
    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "incomplete"
    assert body["missing"] == [
        "description",
        "prep_time_minutes",
        "image_id",
        "ingredients",
        "calories",
        "protein_g",
        "carbs_g",
        "fat_g",
        "steps",
    ]
    assert {e["field"] for e in body["errors"]} == set(body["missing"])
    recipe = (await client.get(f"/api/admin/recipes/{created['id']}", headers=auth)).json()
    assert recipe["is_published"] is False


async def test_publish_sets_published_at_once(client, auth, categories):
    recipe = await create_published(client, auth, categories["plats"])
    assert recipe["is_published"] is True
    first_published_at = recipe["published_at"]
    assert first_published_at is not None

    url = f"/api/admin/recipes/{recipe['id']}"
    unpublished = (await client.post(f"{url}/unpublish", headers=auth)).json()
    assert unpublished["is_published"] is False
    assert unpublished["published_at"] == first_published_at

    republished = (await client.post(f"{url}/publish", headers=auth)).json()
    assert republished["is_published"] is True
    assert republished["published_at"] == first_published_at


async def test_patch_can_publish_with_same_rules(client, auth, categories):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Pot-au-feu"})).json()
    refused = await client.patch(f"/api/admin/recipes/{created['id']}", headers=auth, json={"is_published": True})
    assert refused.status_code == 422
    assert refused.json()["detail"] == "incomplete"


async def test_published_recipe_cannot_become_incomplete(client, auth, categories):
    recipe = await create_published(client, auth, categories["plats"])
    url = f"/api/admin/recipes/{recipe['id']}"
    response = await client.patch(url, headers=auth, json={"steps": [], "image_id": None})
    assert response.status_code == 422
    assert response.json()["missing"] == ["image_id", "steps"]
    unchanged = (await client.get(url, headers=auth)).json()
    assert len(unchanged["steps"]) == 2 and unchanged["image_id"] == recipe["image_id"]


async def test_nutrition_warning_above_15_percent(client, auth, categories):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Poulet rôti"})).json()
    url = f"/api/admin/recipes/{created['id']}"
    # l'exemple de la maquette : 610 kcal saisies alors que les macros donnent 512
    warned = (
        await client.patch(url, headers=auth, json={"calories": 610, "protein_g": 42, "carbs_g": 14, "fat_g": 32})
    ).json()
    assert warned["nutrition"]["estimated_calories"] == 512
    assert warned["nutrition"]["deviation_pct"] == -16.1
    assert warned["nutrition_warning"] == {"estimated": 512, "deviation_pct": -16.1}

    fine = (await client.patch(url, headers=auth, json={"calories": 530})).json()
    assert fine["nutrition_warning"] is None
    assert fine["nutrition"]["deviation_pct"] == -3.4


async def test_large_deviation_saves_draft_but_blocks_publication(client, auth, categories):
    image = await upload_image(client, auth)
    body = complete_payload(categories["plats"], image["id"], calories=900)  # macros : 250 kcal
    created = await client.post("/api/admin/recipes", headers=auth, json=body)
    assert created.status_code == 201
    recipe = created.json()
    assert recipe["nutrition_warning"]["deviation_pct"] == -72.2
    assert recipe["missing"] == ["nutrition_coherence"]

    refused = await client.post(f"/api/admin/recipes/{recipe['id']}/publish", headers=auth)
    assert refused.status_code == 422
    assert refused.json()["missing"] == ["nutrition_coherence"]

    # entre 15 et 40 % on avertit seulement, la publication passe
    await client.patch(f"/api/admin/recipes/{recipe['id']}", headers=auth, json={"calories": 320})
    published = await client.post(f"/api/admin/recipes/{recipe['id']}/publish", headers=auth)
    assert published.status_code == 200
    assert published.json()["nutrition_warning"]["deviation_pct"] == -21.9


async def test_only_one_featured_recipe(client, auth, categories):
    first = await create_published(client, auth, categories["plats"], title="Premier")
    second = await create_published(client, auth, categories["plats"], title="Second")
    assert (await client.post(f"/api/admin/recipes/{first['id']}/feature", headers=auth)).json()["is_featured"] is True
    assert (await client.post(f"/api/admin/recipes/{second['id']}/feature", headers=auth)).json()["is_featured"] is True
    first_now = (await client.get(f"/api/admin/recipes/{first['id']}", headers=auth)).json()
    assert first_now["is_featured"] is False
    featured = (await client.get("/api/recipes/featured")).json()
    assert featured["id"] == second["id"]

    # même règle en passant par le PATCH
    await client.patch(f"/api/admin/recipes/{first['id']}", headers=auth, json={"is_featured": True})
    rows = (await client.get("/api/admin/recipes", headers=auth)).json()["items"]
    assert [r["title"] for r in rows if r["is_featured"]] == ["Premier"]


async def test_only_published_recipes_can_be_featured(client, auth, categories):
    draft = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Brouillon"})).json()
    response = await client.post(f"/api/admin/recipes/{draft['id']}/feature", headers=auth)
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "is_featured"

    recipe = await create_published(client, auth, categories["plats"])
    await client.post(f"/api/admin/recipes/{recipe['id']}/feature", headers=auth)
    unpublished = (await client.post(f"/api/admin/recipes/{recipe['id']}/unpublish", headers=auth)).json()
    assert unpublished["is_featured"] is False


async def test_featured_falls_back_to_latest_published(client, auth, categories):
    assert (await client.get("/api/recipes/featured")).status_code == 404
    await create_published(client, auth, categories["plats"], title="Ancienne")
    latest = await create_published(client, auth, categories["plats"], title="Récente")
    await client.post("/api/admin/recipes", headers=auth, json={"title": "Brouillon plus récent"})
    featured = (await client.get("/api/recipes/featured")).json()
    assert featured["id"] == latest["id"]
    assert featured["is_featured"] is False
