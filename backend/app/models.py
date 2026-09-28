import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime, utcnow


class Unit(enum.StrEnum):
    UNIT = "UNIT"
    G = "G"
    KG = "KG"
    ML = "ML"
    L = "L"
    TBSP = "TBSP"
    TSP = "TSP"
    PINCH = "PINCH"


class Category(Base):
    __tablename__ = "category"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Image(Base):
    __tablename__ = "image"

    id: Mapped[int] = mapped_column(primary_key=True)
    original_path: Mapped[str] = mapped_column(String(255))
    variants: Mapped[dict[str, str]] = mapped_column(JSON)
    lqip: Mapped[str] = mapped_column(Text)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    alt: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Ingredient(Base):
    __tablename__ = "ingredient"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    normalized_name: Mapped[str] = mapped_column(String(120), unique=True, index=True)


class Recipe(Base):
    __tablename__ = "recipe"
    __table_args__ = (
        Index("ix_recipe_published", "is_published", "published_at"),
        Index("ix_recipe_category_published", "category_id", "is_published"),
        # une seule recette en avant à la fois, verrouillé aussi côté base
        Index(
            "uq_recipe_featured",
            "is_featured",
            unique=True,
            sqlite_where=text("is_featured = 1"),
            postgresql_where=text("is_featured"),
        ),
        CheckConstraint("servings IS NULL OR (servings BETWEEN 1 AND 24)", name="servings_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id", ondelete="RESTRICT"))
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer)
    servings: Mapped[int | None] = mapped_column(Integer, default=4)
    image_id: Mapped[int | None] = mapped_column(ForeignKey("image.id", ondelete="SET NULL"))
    calories: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    fat_g: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    carbs_g: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    protein_g: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    is_dietetic: Mapped[bool] = mapped_column(Boolean, default=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    category: Mapped[Category] = relationship(lazy="joined", innerjoin=True)
    image: Mapped[Image | None] = relationship(lazy="joined")
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe",
        order_by="RecipeIngredient.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )
    steps: Mapped[list["Step"]] = relationship(
        back_populates="recipe",
        order_by="Step.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredient"

    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipe.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredient.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    unit: Mapped[Unit] = mapped_column(
        Enum(Unit, name="unit", native_enum=False, length=8, create_constraint=True),
        default=Unit.UNIT,
    )

    recipe: Mapped[Recipe] = relationship(back_populates="ingredients")
    ingredient: Mapped[Ingredient] = relationship(lazy="joined", innerjoin=True)


class Step(Base):
    __tablename__ = "step"
    __table_args__ = (UniqueConstraint("recipe_id", "position", name="uq_step_recipe_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipe.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)

    recipe: Mapped[Recipe] = relationship(back_populates="steps")


class AdminUser(Base):
    __tablename__ = "admin_user"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
