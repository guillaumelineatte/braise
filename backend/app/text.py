"""Normalisation du texte (recherche sans accents) et slugs."""

import re
import unicodedata

_LIGATURES = str.maketrans(
    {
        "œ": "oe",
        "Œ": "oe",
        "æ": "ae",
        "Æ": "ae",
        "ß": "ss",
        "’": "'",
        "‘": "'",
        "ʼ": "'",
        "\u00a0": " ",  # espace insécable
        "\u202f": " ",  # espace fine insécable
    }
)
_SPACES = re.compile(r"\s+")
_NON_SLUG = re.compile(r"[^a-z0-9]+")

SLUG_MAX_LENGTH = 80


def normalize(value: str | None) -> str:
    """Ex. : 'Crème  Brûlée' -> 'creme brulee'."""
    if not value:
        return ""
    value = value.translate(_LIGATURES)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    return _SPACES.sub(" ", value.lower()).strip()


def slugify(value: str | None, max_length: int = SLUG_MAX_LENGTH) -> str:
    """Ex. : 'Tarte aux figues & miel' -> 'tarte-aux-figues-miel'."""
    slug = _NON_SLUG.sub("-", normalize(value)).strip("-")
    if len(slug) > max_length:
        cut = slug[:max_length]
        # on coupe sur un tiret pour ne pas couper un mot en deux
        slug = cut.rsplit("-", 1)[0] if "-" in cut else cut
    return slug


def like_escape(value: str) -> str:
    """Échappe % et _ pour un LIKE (avec escape='\\\\')."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
