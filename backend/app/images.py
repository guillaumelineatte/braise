"""Traitement des images envoyées : recadrage, variantes WebP 320/800/1600, LQIP."""

import asyncio
import base64
import uuid
import warnings
from dataclasses import dataclass
from io import BytesIO

from PIL import Image as PILImage
from PIL import ImageFilter, ImageOps, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Image
from .storage import Storage

VARIANT_WIDTHS = (320, 800, 1600)
DEFAULT_VARIANT = "800"
LQIP_WIDTH = 20
FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}
MAX_PIXELS = 60_000_000


class ImageError(ValueError):
    """Image refusée ; le message est affiché tel quel dans l'admin."""

    def __init__(self, message: str, status_code: int = 415) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class Crop:
    x: int
    y: int
    w: int
    h: int


@dataclass
class ProcessedImage:
    original: bytes
    original_ext: str
    original_type: str
    variants: dict[str, bytes]
    lqip: str
    width: int
    height: int


def _open(data: bytes) -> PILImage.Image:
    with warnings.catch_warnings():
        warnings.simplefilter("error", PILImage.DecompressionBombWarning)
        try:
            probe = PILImage.open(BytesIO(data))
            probe.verify()
            img = PILImage.open(BytesIO(data))
            if img.width * img.height > MAX_PIXELS:
                raise ImageError("Image trop grande : 60 mégapixels au maximum.", 413)
            img.load()
        except (UnidentifiedImageError, OSError, SyntaxError) as exc:
            raise ImageError("Fichier illisible : envoyez une image JPEG, PNG ou WebP.") from exc
        except (PILImage.DecompressionBombError, PILImage.DecompressionBombWarning) as exc:
            raise ImageError("Image trop grande : 60 mégapixels au maximum.", 413) from exc
    return img


def process_image(data: bytes, crop: Crop | None = None) -> ProcessedImage:
    img = _open(data)
    if img.format not in FORMATS:
        raise ImageError("Format non pris en charge : JPEG, PNG ou WebP uniquement.")
    content_type, ext = FORMATS[img.format]

    # EXIF d'abord : le recadrage vient du navigateur, qui affiche déjà l'image redressée.
    img = ImageOps.exif_transpose(img)
    if crop is not None:
        if crop.w <= 0 or crop.h <= 0:
            raise ImageError("Recadrage invalide : largeur et hauteur doivent être positives.", 422)
        left = max(0, min(crop.x, img.width - 1))
        top = max(0, min(crop.y, img.height - 1))
        right = max(left + 1, min(crop.x + crop.w, img.width))
        bottom = max(top + 1, min(crop.y + crop.h, img.height))
        img = img.crop((left, top, right, bottom))

    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    img = img.convert("RGBA" if has_alpha else "RGB")
    width, height = img.size

    variants: dict[str, bytes] = {}
    for target in VARIANT_WIDTHS:
        if width > target:
            resized = img.resize((target, max(1, round(height * target / width))), PILImage.Resampling.LANCZOS)
        else:
            resized = img
        buffer = BytesIO()
        resized.save(buffer, "WEBP", quality=80, method=5)
        variants[str(target)] = buffer.getvalue()

    tiny = img.resize((LQIP_WIDTH, max(1, round(height * LQIP_WIDTH / width))), PILImage.Resampling.BILINEAR)
    tiny = tiny.filter(ImageFilter.GaussianBlur(0.8))
    buffer = BytesIO()
    tiny.save(buffer, "WEBP", quality=40)
    lqip = "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

    return ProcessedImage(
        original=data,
        original_ext=ext,
        original_type=content_type,
        variants=variants,
        lqip=lqip,
        width=width,
        height=height,
    )


async def store_image(
    session: AsyncSession,
    storage: Storage,
    data: bytes,
    *,
    alt: str = "",
    crop: Crop | None = None,
) -> Image:
    processed = await asyncio.to_thread(process_image, data, crop)
    folder = f"images/{uuid.uuid4().hex}"
    original_path = f"{folder}/original.{processed.original_ext}"
    await storage.save(original_path, processed.original, processed.original_type)
    variant_paths: dict[str, str] = {}
    for size, payload in processed.variants.items():
        path = f"{folder}/{size}.webp"
        await storage.save(path, payload, "image/webp")
        variant_paths[size] = path
    image = Image(
        original_path=original_path,
        variants=variant_paths,
        lqip=processed.lqip,
        width=processed.width,
        height=processed.height,
        alt=alt.strip(),
    )
    session.add(image)
    await session.flush()
    return image


async def delete_image_files(storage: Storage, image: Image) -> None:
    for path in [image.original_path, *image.variants.values()]:
        await storage.delete(path)
