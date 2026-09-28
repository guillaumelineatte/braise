from io import BytesIO
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image as PILImage

from app.main import create_app
from conftest import ADMIN_EMAIL, ADMIN_PASSWORD, jpeg_bytes, prepare_database, upload_image


def _open_media(settings, url: str) -> PILImage.Image:
    path = Path(settings.media_root) / url.removeprefix("/media/")
    return PILImage.open(path)


async def test_upload_generates_variants_and_lqip(client, auth, settings):
    files = {"file": ("plat.jpg", jpeg_bytes(2400, 1920), "image/jpeg")}
    response = await client.post("/api/admin/uploads", headers=auth, files=files, data={"alt": "  Un plat fumant  "})
    assert response.status_code == 201
    image = response.json()
    assert image["alt"] == "Un plat fumant"
    assert (image["width"], image["height"]) == (2400, 1920)
    assert set(image["variants"]) == {"320", "800", "1600"}
    assert image["url"] == image["variants"]["800"]
    for size, url in image["variants"].items():
        variant = _open_media(settings, url)
        assert variant.format == "WEBP"
        assert variant.width == int(size)
        assert variant.height == round(1920 * int(size) / 2400)
    assert image["srcset"].endswith("/1600.webp 1600w")
    assert image["lqip"].startswith("data:image/webp;base64,")
    assert len(image["lqip"]) < 1000
    original = list((Path(settings.media_root) / "images").glob("*/original.jpg"))
    assert len(original) == 1


async def test_small_images_are_not_upscaled(client, auth, settings):
    files = {"file": ("petit.png", jpeg_bytes(600, 480, fmt="PNG"), "image/png")}
    image = (await client.post("/api/admin/uploads", headers=auth, files=files)).json()
    assert _open_media(settings, image["variants"]["1600"]).width == 600
    assert _open_media(settings, image["variants"]["320"]).width == 320
    assert image["srcset"].endswith("/1600.webp 600w")


async def test_upload_applies_crop_in_original_pixels(client, auth, settings):
    image = await upload_image(client, auth, crop_x=0, crop_y=0, crop_w=300, crop_h=240)
    assert (image["width"], image["height"]) == (300, 240)
    # le coin haut-gauche de l'image de test est teinté accent (180, 85, 45)
    variant = _open_media(settings, image["variants"]["1600"]).convert("RGB")
    r, g, b = variant.getpixel((150, 120))
    assert abs(r - 180) < 12 and abs(g - 85) < 12 and abs(b - 45) < 12


async def test_upload_rejects_partial_crop(client, auth):
    files = {"file": ("plat.jpg", jpeg_bytes(), "image/jpeg")}
    response = await client.post("/api/admin/uploads", headers=auth, files=files, data={"crop_x": "10"})
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "crop"


@pytest.mark.parametrize(
    ("name", "content", "content_type"),
    [
        ("notes.txt", b"pas une image", "text/plain"),
        ("faux.jpg", b"pas une image non plus", "image/jpeg"),
        ("anim.gif", None, "image/gif"),
    ],
)
async def test_upload_rejects_other_types(client, auth, name, content, content_type):
    if content is None:
        buffer = BytesIO()
        PILImage.new("RGB", (10, 10)).save(buffer, "GIF")
        content = buffer.getvalue()
    response = await client.post("/api/admin/uploads", headers=auth, files={"file": (name, content, content_type)})
    assert response.status_code == 415
    assert response.json()["errors"][0]["field"] == "file"


async def test_undeclared_type_is_judged_on_content(client, auth):
    buffer = BytesIO()
    PILImage.new("RGB", (400, 320), (111, 122, 75)).save(buffer, "WEBP")
    files = {"file": ("photo.webp", buffer.getvalue(), "application/octet-stream")}
    assert (await client.post("/api/admin/uploads", headers=auth, files=files)).status_code == 201


async def test_upload_size_limit(settings):
    settings.max_upload_mb = 1
    app = create_app(settings)
    await prepare_database(app)
    from app.models import AdminUser
    from app.security import hash_password

    async with app.state.sessionmaker() as session:
        session.add(AdminUser(email=ADMIN_EMAIL, hashed_password=hash_password(ADMIN_PASSWORD)))
        await session.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = (await client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})).json()[
            "access_token"
        ]
        big = b"\xff\xd8" + b"0" * (1024 * 1024 + 10)
        response = await client.post(
            "/api/admin/uploads",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("lourd.jpg", big, "image/jpeg")},
        )
    assert response.status_code == 413
    assert response.json()["detail"] == "Fichier trop lourd : 1 Mo au maximum."
    await app.state.engine.dispose()


async def test_update_alt_text(client, auth):
    image = await upload_image(client, auth)
    response = await client.patch(f"/api/admin/images/{image['id']}", headers=auth, json={"alt": "Tarte aux figues"})
    assert response.status_code == 200
    assert response.json()["alt"] == "Tarte aux figues"
