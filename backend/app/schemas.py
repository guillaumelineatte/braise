"""Schémas de l'API.

Ils ont leur pendant Zod dans frontend/src/api/schemas.ts. Si un champ change ici, régénérer
openapi.json : le test côté front vérifie que les deux collent.
"""

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    field_validator,
)

from .models import Unit

T = TypeVar("T")


def _decimal(places: int):
    quantum = Decimal(1).scaleb(-places)

    def parse(value: Any) -> Any:
        if value is None or value == "":
            return None
        if isinstance(value, str):
            value = value.strip().replace(" ", "").replace(" ", "").replace(",", ".")
        if isinstance(value, float):
            value = repr(value)
        try:
            return Decimal(value).quantize(quantum, rounding=ROUND_HALF_UP)
        except (InvalidOperation, TypeError, ValueError):
            return value  # Pydantic s'occupe de renvoyer l'erreur

    return parse


def _to_number(value: Decimal) -> float | int:
    return int(value) if value == value.to_integral_value() else float(value)


_Number = PlainSerializer(_to_number, return_type=float, when_used="json")

# Decimal en base, nombre dans le JSON. On accepte "12,5" en entrée.
Macro = Annotated[Decimal, BeforeValidator(_decimal(1)), Field(ge=0, le=Decimal("99999.9")), _Number]
MacroOut = Annotated[Decimal, _Number]
Quantity = Annotated[Decimal, BeforeValidator(_decimal(2)), Field(ge=0, le=Decimal("99999999.99")), _Number]

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- images


class ImageOut(Schema):
    id: int
    url: str
    variants: dict[str, str]
    srcset: str
    lqip: str
    width: int
    height: int
    alt: str


class ImageUpdate(Schema):
    alt: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


class Thumbnail(Schema):
    url: str
    lqip: str


# ---------------------------------------------------------------- catégories


class CategoryBrief(Schema):
    id: int
    name: str
    slug: str


class CategoryOut(Schema):
    id: int
    name: str
    slug: str
    position: int
    recipe_count: int
    dietetic_count: int
    cover: ImageOut | None = None


class CategoryAdmin(Schema):
    id: int
    name: str
    slug: str
    position: int
    recipe_count: int
    published_count: int
    dietetic_count: int
    slug_locked: bool


class CategoryCreate(Schema):
    name: Name


class CategoryUpdate(Schema):
    name: Name | None = None


class CategoryReorder(Schema):
    ids: list[int] = Field(min_length=1)


# ---------------------------------------------------------------- recettes : lignes


class IngredientLineIn(Schema):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    quantity: Quantity | None = None
    unit: Unit = Unit.UNIT


class IngredientLineOut(Schema):
    ingredient_id: int
    name: str
    quantity: Annotated[Decimal, _Number] | None
    unit: Unit
    position: int


class StepIn(Schema):
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class StepOut(Schema):
    id: int
    position: int
    content: str


class Nutrition(Schema):
    calories: MacroOut | None
    protein_g: MacroOut | None
    carbs_g: MacroOut | None
    fat_g: MacroOut | None
    estimated_calories: MacroOut | None
    deviation_pct: float | None


class NutritionWarning(Schema):
    estimated: MacroOut
    deviation_pct: float


# ---------------------------------------------------------------- recettes : lecture publique


class RecipeCard(Schema):
    id: int
    title: str
    slug: str
    description: str
    category: CategoryBrief
    prep_time_minutes: int | None
    servings: int | None
    calories: MacroOut | None
    is_dietetic: bool
    is_featured: bool
    published_at: datetime | None
    image: ImageOut | None


class RecipeDetail(RecipeCard):
    updated_at: datetime
    ingredients: list[IngredientLineOut]
    steps: list[StepOut]
    nutrition: Nutrition
    related: list[RecipeCard]


# ---------------------------------------------------------------- recettes : administration


class RecipeAdmin(Schema):
    id: int
    title: str
    slug: str
    slug_locked: bool
    description: str
    category_id: int
    category: CategoryBrief
    prep_time_minutes: int | None
    servings: int | None
    image_id: int | None
    image: ImageOut | None
    calories: MacroOut | None
    protein_g: MacroOut | None
    carbs_g: MacroOut | None
    fat_g: MacroOut | None
    is_dietetic: bool
    is_published: bool
    is_featured: bool
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    ingredients: list[IngredientLineOut]
    steps: list[StepOut]
    nutrition: Nutrition
    nutrition_warning: NutritionWarning | None
    missing: list[str]


class RecipeAdminRow(Schema):
    id: int
    title: str
    slug: str
    category: CategoryBrief
    is_published: bool
    is_featured: bool
    is_dietetic: bool
    calories: MacroOut | None
    updated_at: datetime
    published_at: datetime | None
    thumbnail: Thumbnail | None


class _RecipeFields(Schema):
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    category_id: int | None = None
    prep_time_minutes: Annotated[int, Field(ge=0, le=100_000)] | None = None
    servings: Annotated[int, Field(ge=1, le=24)] | None = None
    image_id: int | None = None
    calories: Macro | None = None
    protein_g: Macro | None = None
    carbs_g: Macro | None = None
    fat_g: Macro | None = None
    is_dietetic: bool | None = None
    ingredients: Annotated[list[IngredientLineIn], Field(max_length=100)] | None = None
    steps: Annotated[list[StepIn], Field(max_length=60)] | None = None
    slug: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    force_slug: bool = False


class RecipeCreate(_RecipeFields):
    """Création (le titre suffit) et remplacement complet via PUT."""

    title: Title


class RecipeUpdate(_RecipeFields):
    """PATCH : on n'applique que les champs présents dans la requête."""

    title: Title | None = None
    is_published: bool | None = None
    is_featured: bool | None = None

    @field_validator("title", "category_id", "is_published", "is_featured")
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Ce champ ne peut pas être vide.")
        return value


# ---------------------------------------------------------------- pagination, tableau de bord, auth


class Page(Schema, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class Dashboard(Schema):
    published_count: int
    draft_count: int
    category_count: int
    recent: list[RecipeAdminRow]
    drafts: list[RecipeAdminRow]


# Pas d'EmailStr : il refuse les domaines .local/.test qu'on utilise en dev.
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$"),
]


class LoginIn(Schema):
    email: Email
    password: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class Token(Schema):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime


class AdminMe(Schema):
    id: int
    email: str
    created_at: datetime


# ---------------------------------------------------------------- erreurs (documentation OpenAPI)


class FieldError(Schema):
    field: str
    message: str


class ErrorOut(Schema):
    detail: str
    errors: list[FieldError] | None = None
    missing: list[str] | None = None
