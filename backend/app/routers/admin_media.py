"""Upload des images et mise à jour du texte alternatif (admin)."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..errors import ApiError
from ..images import Crop, ImageError, store_image
from ..models import Image
from ..schemas import ErrorOut, ImageOut, ImageUpdate
from ..security import current_admin
from ..services.serializers import image_out
from .deps import SessionDep, SettingsDep, StorageDep

router = APIRouter(prefix="/admin", tags=["Administration — images"], dependencies=[Depends(current_admin)])

ACCEPTED_TYPES = {"image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"}
# curl n'envoie pas de type pour le WebP par ex. : dans ce cas Pillow vérifie le contenu.
UNDECLARED_TYPES = {"", "application/octet-stream"}
ERRORS = {
    401: {"model": ErrorOut},
    403: {"model": ErrorOut},
    413: {"model": ErrorOut},
    415: {"model": ErrorOut},
    422: {"model": ErrorOut},
}


async def _read_limited(file: UploadFile, limit: int) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > limit:
            raise ApiError(
                413,
                f"Fichier trop lourd : {limit // (1024 * 1024)} Mo au maximum.",
                errors=[{"field": "file", "message": f"{limit // (1024 * 1024)} Mo au maximum."}],
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/uploads", response_model=ImageOut, status_code=201, responses=ERRORS)
async def upload(
    session: SessionDep,
    storage: StorageDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File(description="JPEG, PNG ou WebP, 12 Mo maximum")],
    alt: Annotated[str, Form(max_length=300)] = "",
    crop_x: Annotated[int | None, Form(ge=0)] = None,
    crop_y: Annotated[int | None, Form(ge=0)] = None,
    crop_w: Annotated[int | None, Form(gt=0)] = None,
    crop_h: Annotated[int | None, Form(gt=0)] = None,
) -> ImageOut:
    """Crée les variantes WebP 320/800/1600 + le LQIP. crop_* en pixels de l'image d'origine."""
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ACCEPTED_TYPES | UNDECLARED_TYPES:
        raise ApiError(
            415,
            "Format non pris en charge : JPEG, PNG ou WebP uniquement.",
            errors=[{"field": "file", "message": "JPEG, PNG ou WebP uniquement."}],
        )
    crop_values = (crop_x, crop_y, crop_w, crop_h)
    if any(v is not None for v in crop_values) and not all(v is not None for v in crop_values):
        raise ApiError(
            422, "invalid", errors=[{"field": "crop", "message": "Recadrage incomplet : x, y, largeur et hauteur."}]
        )
    crop = Crop(crop_x, crop_y, crop_w, crop_h) if all(v is not None for v in crop_values) else None  # type: ignore[arg-type]

    data = await _read_limited(file, settings.max_upload_bytes)
    if not data:
        raise ApiError(422, "invalid", errors=[{"field": "file", "message": "Fichier vide."}])
    try:
        image = await store_image(session, storage, data, alt=alt, crop=crop)
    except ImageError as exc:
        raise ApiError(exc.status_code, str(exc), errors=[{"field": "file", "message": str(exc)}]) from None
    await session.commit()
    out = image_out(image, storage)
    assert out is not None
    return out


@router.patch("/images/{image_id}", response_model=ImageOut, responses=ERRORS)
async def update_image(image_id: int, payload: ImageUpdate, session: SessionDep, storage: StorageDep) -> ImageOut:
    """Met à jour le texte alternatif."""
    image = await session.get(Image, image_id)
    if image is None:
        raise ApiError(404, "Image introuvable.")
    image.alt = payload.alt
    await session.commit()
    out = image_out(image, storage)
    assert out is not None
    return out
