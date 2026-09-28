import asyncio

from sqlalchemy import func, select

from app.models import Image, Ingredient, RecipeIngredient, Step
from conftest import complete_payload, create_published, upload_image


async def test_create_draft_from_title_only(client, auth, categories):
    response = await client.post("/api/admin/recipes", headers=auth, json={"title": "Pot-au-feu"})
    assert response.status_code == 201
    recipe = response.json()
    assert recipe["slug"] == "pot-au-feu"
    assert recipe["is_published"] is False
    assert recipe["published_at"] is None
    assert recipe["category"]["slug"] == "entrees"  # première catégorie par position
    assert recipe["servings"] == 4
    assert recipe["ingredients"] == [] and recipe["steps"] == []
    assert recipe["slug_locked"] is False
    assert {"description", "image_id", "ingredients", "steps", "calories"} <= set(recipe["missing"])


async def test_create_requires_a_category(client, auth):
    response = await client.post("/api/admin/recipes", headers=auth, json={"title": "Orpheline"})
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "category_id", "message": "Créez d'abord une catégorie."}]


async def test_create_validates_title(client, auth, categories):
    response = await client.post("/api/admin/recipes", headers=auth, json={"title": "   "})
    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "invalid"
    assert body["errors"] == [{"field": "title", "message": "Ce champ ne peut pas être vide."}]


async def test_create_from_full_body(client, auth, categories):
    image = await upload_image(client, auth)
    response = await client.post(
        "/api/admin/recipes", headers=auth, json=complete_payload(categories["plats"], image["id"], is_dietetic=True)
    )
    assert response.status_code == 201
    recipe = response.json()
    assert recipe["category"]["slug"] == "plats"
    assert recipe["is_dietetic"] is True
    assert [line["name"] for line in recipe["ingredients"]] == ["Lentilles corail", "Carotte", "Lait de coco"]
    assert recipe["missing"] == []
    assert recipe["image"]["id"] == image["id"]


async def test_patch_is_partial(client, auth, categories):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Gratin dauphinois"})).json()
    response = await client.patch(
        f"/api/admin/recipes/{created['id']}", headers=auth, json={"prep_time_minutes": 90, "calories": "420,5"}
    )
    assert response.status_code == 200
    recipe = response.json()
    assert recipe["prep_time_minutes"] == 90
    assert recipe["calories"] == 420.5
    assert recipe["title"] == "Gratin dauphinois"
    assert recipe["servings"] == 4
    assert recipe["updated_at"] > created["updated_at"]


async def test_patch_replaces_ingredients_in_order_and_resolves_names(client, auth, categories, app):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Blanquette"})).json()
    url = f"/api/admin/recipes/{created['id']}"
    first = await client.patch(
        url,
        headers=auth,
        json={
            "ingredients": [
                {"name": "Crème fraîche", "quantity": 200, "unit": "ML"},
                {"name": "Veau", "quantity": "1,2", "unit": "KG"},
            ]
        },
    )
    assert first.status_code == 200
    # nouvelle liste complète, et "creme FRAICHE" doit retomber sur "Crème fraîche"
    second = await client.patch(
        url,
        headers=auth,
        json={
            "ingredients": [
                {"name": "Carottes", "quantity": 3, "unit": "UNIT"},
                {"name": "creme FRAICHE", "quantity": 150.555, "unit": "ML"},
            ]
        },
    )
    assert second.status_code == 200
    lines = second.json()["ingredients"]
    assert [(line["name"], line["quantity"], line["unit"], line["position"]) for line in lines] == [
        ("Carottes", 3, "UNIT", 1),
        ("Crème fraîche", 150.56, "ML", 2),
    ]
    async with app.state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(RecipeIngredient)) == 2
        names = set((await session.scalars(select(Ingredient.name))).all())
    assert names == {"Crème fraîche", "Veau", "Carottes"}


async def test_patch_rejects_empty_lines(client, auth, categories):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Tian"})).json()
    response = await client.patch(
        f"/api/admin/recipes/{created['id']}",
        headers=auth,
        json={
            "steps": [{"content": "Émincez les légumes."}, {"content": "  "}],
            "ingredients": [{"name": "", "unit": "G"}],
        },
    )
    assert response.status_code == 422
    fields = {e["field"]: e["message"] for e in response.json()["errors"]}
    assert fields == {
        "steps.1.content": "Ce champ ne peut pas être vide.",
        "ingredients.0.name": "Ce champ ne peut pas être vide.",
    }


async def test_patch_rejects_invalid_values(client, auth, categories):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Tian"})).json()
    response = await client.patch(
        f"/api/admin/recipes/{created['id']}",
        headers=auth,
        json={"servings": 30, "fat_g": -2, "category_id": 999, "title": None},
    )
    assert response.status_code == 422
    fields = {e["field"] for e in response.json()["errors"]}
    assert fields == {"servings", "fat_g", "title"}
    unknown = await client.patch(f"/api/admin/recipes/{created['id']}", headers=auth, json={"category_id": 999})
    assert unknown.status_code == 422
    assert unknown.json()["errors"] == [{"field": "category_id", "message": "Catégorie inconnue."}]


async def test_steps_are_replaced(client, auth, categories, app):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Crêpes"})).json()
    url = f"/api/admin/recipes/{created['id']}"
    await client.patch(
        url, headers=auth, json={"steps": [{"content": "Un"}, {"content": "Deux"}, {"content": "Trois"}]}
    )
    response = await client.patch(url, headers=auth, json={"steps": [{"content": "Trois"}, {"content": "Un"}]})
    assert [(s["position"], s["content"]) for s in response.json()["steps"]] == [(1, "Trois"), (2, "Un")]
    async with app.state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(Step)) == 2


async def test_put_replaces_content_but_not_publication_state(client, auth, categories):
    recipe = await create_published(client, auth, categories["plats"])
    body = complete_payload(
        categories["entrees"], recipe["image_id"], title="Soupe de lentilles corail", steps=[{"content": "Tout."}]
    )
    body.pop("is_dietetic")
    response = await client.put(f"/api/admin/recipes/{recipe['id']}", headers=auth, json=body)
    assert response.status_code == 200
    updated = response.json()
    assert updated["is_published"] is True
    assert updated["category"]["slug"] == "entrees"
    assert [s["content"] for s in updated["steps"]] == ["Tout."]
    assert updated["is_dietetic"] is False


async def test_slug_follows_title_while_draft_and_is_unique(client, auth, categories):
    first = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Tarte Tatin"})).json()
    assert first["slug"] == "tarte-tatin"
    # cas de l'éditeur : brouillon créé à la 1re lettre, le slug doit suivre le titre ensuite
    draft = (await client.post("/api/admin/recipes", headers=auth, json={"title": "T"})).json()
    assert draft["slug"] == "t"
    renamed = (
        await client.patch(f"/api/admin/recipes/{draft['id']}", headers=auth, json={"title": "Tarte tatin"})
    ).json()
    assert renamed["slug"] == "tarte-tatin-2"
    third = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Tarte  TATIN !"})).json()
    assert third["slug"] == "tarte-tatin-3"
    # slug saisi à la main : il ne bouge plus quand le titre change
    custom = (
        await client.patch(f"/api/admin/recipes/{third['id']}", headers=auth, json={"slug": "Tatin de Grand-Mère"})
    ).json()
    assert custom["slug"] == "tatin-de-grand-mere"
    retitled = (
        await client.patch(f"/api/admin/recipes/{third['id']}", headers=auth, json={"title": "Tatin aux coings"})
    ).json()
    assert retitled["slug"] == "tatin-de-grand-mere"


async def test_slug_conflict_is_reported(client, auth, categories):
    await client.post("/api/admin/recipes", headers=auth, json={"title": "Clafoutis"})
    other = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Flognarde"})).json()
    response = await client.patch(f"/api/admin/recipes/{other['id']}", headers=auth, json={"slug": "clafoutis"})
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "slug"


async def test_slug_locked_after_publication(client, auth, categories):
    recipe = await create_published(client, auth, categories["plats"])
    url = f"/api/admin/recipes/{recipe['id']}"
    assert recipe["slug_locked"] is True

    retitled = (await client.patch(url, headers=auth, json={"title": "Soupe de lentilles au curry"})).json()
    assert retitled["slug"] == "soupe-de-lentilles-corail"

    refused = await client.patch(url, headers=auth, json={"slug": "soupe-curry"})
    assert refused.status_code == 422
    assert refused.json()["detail"] == "slug_locked"

    # toujours verrouillé après dépublication, le lien a pu être partagé
    await client.post(f"{url}/unpublish", headers=auth)
    assert (await client.patch(url, headers=auth, json={"slug": "soupe-curry"})).status_code == 422

    forced = await client.patch(url, headers=auth, json={"slug": "soupe-curry", "force_slug": True})
    assert forced.status_code == 200
    assert forced.json()["slug"] == "soupe-curry"


async def test_duplicate(client, auth, categories):
    source = await create_published(client, auth, categories["plats"], is_dietetic=True)
    await client.post(f"/api/admin/recipes/{source['id']}/feature", headers=auth)
    response = await client.post(f"/api/admin/recipes/{source['id']}/duplicate", headers=auth)
    assert response.status_code == 201
    copy = response.json()
    assert copy["id"] != source["id"]
    assert copy["title"] == "Soupe de lentilles corail (copie)"
    assert copy["slug"] == "soupe-de-lentilles-corail-copie"
    assert copy["is_published"] is False and copy["is_featured"] is False and copy["published_at"] is None
    assert copy["image_id"] == source["image_id"]
    assert copy["is_dietetic"] is True
    assert [(i["name"], i["quantity"]) for i in copy["ingredients"]] == [
        (i["name"], i["quantity"]) for i in source["ingredients"]
    ]
    assert [s["content"] for s in copy["steps"]] == [s["content"] for s in source["steps"]]
    again = (await client.post(f"/api/admin/recipes/{source['id']}/duplicate", headers=auth)).json()
    assert again["slug"] == "soupe-de-lentilles-corail-copie-2"


async def test_delete_cascades_but_keeps_image(client, auth, categories, app):
    recipe = await create_published(client, auth, categories["plats"])
    response = await client.delete(f"/api/admin/recipes/{recipe['id']}", headers=auth)
    assert response.status_code == 204
    assert (await client.get(f"/api/admin/recipes/{recipe['id']}", headers=auth)).status_code == 404
    async with app.state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(RecipeIngredient)) == 0
        assert await session.scalar(select(func.count()).select_from(Step)) == 0
        assert await session.scalar(select(func.count()).select_from(Image)) == 1


async def test_admin_list_filters_and_sorts(client, auth, categories):
    await create_published(
        client, auth, categories["plats"], title="Aligot", calories=600, protein_g=20, carbs_g=50, fat_g=35
    )
    await create_published(client, auth, categories["entrees"], title="Velouté", is_dietetic=True)
    await client.post("/api/admin/recipes", headers=auth, json={"title": "Brouillon de bœuf"})

    everything = (await client.get("/api/admin/recipes", headers=auth)).json()
    assert everything["total"] == 3
    assert everything["items"][0]["title"] == "Brouillon de bœuf"  # dernière modification d'abord
    assert everything["items"][0]["thumbnail"] is None

    drafts = (await client.get("/api/admin/recipes", headers=auth, params={"status": "draft"})).json()
    assert [r["title"] for r in drafts["items"]] == ["Brouillon de bœuf"]
    published = (
        await client.get(
            "/api/admin/recipes", headers=auth, params={"status": "published", "sort": "title", "order": "asc"}
        )
    ).json()
    assert [r["title"] for r in published["items"]] == ["Aligot", "Velouté"]
    assert published["items"][0]["thumbnail"]["url"].endswith("/320.webp")
    dietetic = (await client.get("/api/admin/recipes", headers=auth, params={"dietetic": "true"})).json()
    assert [r["title"] for r in dietetic["items"]] == ["Velouté"]
    by_category = (await client.get("/api/admin/recipes", headers=auth, params={"category": "plats"})).json()
    assert [r["title"] for r in by_category["items"]] == ["Aligot"]
    by_calories = (
        await client.get("/api/admin/recipes", headers=auth, params={"sort": "calories", "order": "desc"})
    ).json()
    assert [r["title"] for r in by_calories["items"]] == ["Aligot", "Velouté", "Brouillon de bœuf"]
    searched = (await client.get("/api/admin/recipes", headers=auth, params={"q": "boeuf"})).json()
    assert [r["title"] for r in searched["items"]] == ["Brouillon de bœuf"]


async def test_dashboard(client, auth, categories):
    await create_published(client, auth, categories["plats"], title="Aligot")
    await client.post("/api/admin/recipes", headers=auth, json={"title": "Brouillon"})
    dashboard = (await client.get("/api/admin/dashboard", headers=auth)).json()
    assert dashboard["published_count"] == 1
    assert dashboard["draft_count"] == 1
    assert dashboard["category_count"] == 5
    assert [r["title"] for r in dashboard["recent"]] == ["Brouillon", "Aligot"]
    assert [r["title"] for r in dashboard["drafts"]] == ["Brouillon"]


async def test_concurrent_autosaves_do_not_corrupt_lines(client, auth, categories):
    created = (await client.post("/api/admin/recipes", headers=auth, json={"title": "Pistou"})).json()
    url = f"/api/admin/recipes/{created['id']}"
    payloads = [{"ingredients": [{"name": f"Basilic {n}", "quantity": n, "unit": "G"}]} for n in range(1, 6)]
    responses = await asyncio.gather(*(client.patch(url, headers=auth, json=p) for p in payloads))
    assert all(r.status_code in (200, 409) for r in responses)
    final = (await client.get(url, headers=auth)).json()
    assert len(final["ingredients"]) == 1
