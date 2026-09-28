from conftest import create_published


async def test_delete_refused_when_recipes_are_attached(client, auth, categories):
    await client.post(
        "/api/admin/recipes", headers=auth, json={"title": "Brouillon", "category_id": categories["pains"]}
    )
    response = await client.delete(f"/api/admin/categories/{categories['pains']}", headers=auth)
    assert response.status_code == 409
    body = response.json()
    assert body["recipe_count"] == 1
    assert (
        body["detail"]
        == "1 recette y est rattachée : déplacez-les vers une autre catégorie avant de supprimer celle-ci."
    )
    assert len((await client.get("/api/categories")).json()) == 5


async def test_delete_empty_category(client, auth, categories):
    response = await client.delete(f"/api/admin/categories/{categories['aperitif']}", headers=auth)
    assert response.status_code == 204
    assert [c["slug"] for c in (await client.get("/api/categories")).json()] == [
        "entrees",
        "plats",
        "patisserie",
        "pains",
    ]


async def test_create_and_rename(client, auth, categories):
    created = await client.post("/api/admin/categories", headers=auth, json={"name": "Desserts glacés"})
    assert created.status_code == 201
    category = created.json()
    assert category["slug"] == "desserts-glaces"
    assert category["position"] == 6
    assert category["slug_locked"] is False

    duplicate = await client.post("/api/admin/categories", headers=auth, json={"name": "desserts GLACÉS"})
    assert duplicate.status_code == 422

    renamed = (
        await client.patch(f"/api/admin/categories/{category['id']}", headers=auth, json={"name": "Glaces"})
    ).json()
    assert renamed["slug"] == "glaces"  # jamais publiée : le slug suit le nom

    await create_published(client, auth, category["id"], title="Sorbet")
    locked = (
        await client.patch(f"/api/admin/categories/{category['id']}", headers=auth, json={"name": "Glaces et sorbets"})
    ).json()
    assert locked["name"] == "Glaces et sorbets"
    assert locked["slug"] == "glaces"
    assert locked["slug_locked"] is True
    assert (locked["recipe_count"], locked["published_count"]) == (1, 1)


async def test_duplicate_names_are_refused(client, auth, categories):
    response = await client.post("/api/admin/categories", headers=auth, json={"name": "plats"})
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "name", "message": "Une catégorie porte déjà ce nom."}]


async def test_reorder(client, auth, categories):
    order = [categories[s] for s in ("aperitif", "entrees", "plats", "patisserie", "pains")]
    response = await client.post("/api/admin/categories/reorder", headers=auth, json={"ids": order})
    assert response.status_code == 200
    assert [c["id"] for c in response.json()] == order
    assert [c["slug"] for c in (await client.get("/api/categories")).json()][0] == "aperitif"

    incomplete = await client.post("/api/admin/categories/reorder", headers=auth, json={"ids": order[:3]})
    assert incomplete.status_code == 422
