"""Schéma initial

Revision ID: 0001
Revises:
Create Date: 2026-09-27

Sous Postgres, on tente aussi d'activer unaccent et pg_trgm (il faut les droits).
"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.exc import DBAPIError

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_search_extensions() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for extension in ("unaccent", "pg_trgm"):
        try:
            with bind.begin_nested():
                bind.exec_driver_sql(f"CREATE EXTENSION IF NOT EXISTS {extension}")
        except DBAPIError as exc:  # pas les droits : tant pis, la recherche fera sans
            logging.getLogger("alembic").warning("Extension %s indisponible : %s", extension, exc.orig)


def upgrade() -> None:
    _create_search_extensions()
    op.create_table(
        "admin_user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_admin_user")),
        sa.UniqueConstraint("email", name=op.f("uq_admin_user_email")),
    )
    op.create_table(
        "category",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_category")),
        sa.UniqueConstraint("slug", name=op.f("uq_category_slug")),
    )
    op.create_table(
        "image",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("original_path", sa.String(length=255), nullable=False),
        sa.Column("variants", sa.JSON(), nullable=False),
        sa.Column("lqip", sa.Text(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("alt", sa.String(length=300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_image")),
    )
    op.create_table(
        "ingredient",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("normalized_name", sa.String(length=120), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ingredient")),
        sa.UniqueConstraint("name", name=op.f("uq_ingredient_name")),
    )
    with op.batch_alter_table("ingredient", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_ingredient_normalized_name"), ["normalized_name"], unique=True)

    op.create_table(
        "recipe",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("prep_time_minutes", sa.Integer(), nullable=True),
        sa.Column("servings", sa.Integer(), nullable=True),
        sa.Column("image_id", sa.Integer(), nullable=True),
        sa.Column("calories", sa.Numeric(precision=6, scale=1), nullable=True),
        sa.Column("fat_g", sa.Numeric(precision=6, scale=1), nullable=True),
        sa.Column("carbs_g", sa.Numeric(precision=6, scale=1), nullable=True),
        sa.Column("protein_g", sa.Numeric(precision=6, scale=1), nullable=True),
        sa.Column("is_dietetic", sa.Boolean(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("is_featured", sa.Boolean(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("servings IS NULL OR (servings BETWEEN 1 AND 24)", name=op.f("ck_recipe_servings_range")),
        sa.ForeignKeyConstraint(
            ["category_id"], ["category.id"], name=op.f("fk_recipe_category_id_category"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["image_id"], ["image.id"], name=op.f("fk_recipe_image_id_image"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recipe")),
    )
    with op.batch_alter_table("recipe", schema=None) as batch_op:
        batch_op.create_index("ix_recipe_category_published", ["category_id", "is_published"], unique=False)
        batch_op.create_index("ix_recipe_published", ["is_published", "published_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_recipe_slug"), ["slug"], unique=True)
        batch_op.create_index(
            "uq_recipe_featured",
            ["is_featured"],
            unique=True,
            sqlite_where=sa.text("is_featured = 1"),
            postgresql_where=sa.text("is_featured"),
        )

    op.create_table(
        "recipe_ingredient",
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column(
            "unit",
            sa.Enum(
                "UNIT",
                "G",
                "KG",
                "ML",
                "L",
                "TBSP",
                "TSP",
                "PINCH",
                name="unit",
                native_enum=False,
                create_constraint=True,
                length=8,
            ),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["ingredient_id"],
            ["ingredient.id"],
            name=op.f("fk_recipe_ingredient_ingredient_id_ingredient"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipe.id"], name=op.f("fk_recipe_ingredient_recipe_id_recipe"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("recipe_id", "position", name=op.f("pk_recipe_ingredient")),
    )
    with op.batch_alter_table("recipe_ingredient", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_recipe_ingredient_ingredient_id"), ["ingredient_id"], unique=False)

    op.create_table(
        "step",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["recipe_id"], ["recipe.id"], name=op.f("fk_step_recipe_id_recipe"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_step")),
        sa.UniqueConstraint("recipe_id", "position", name="uq_step_recipe_position"),
    )
    with op.batch_alter_table("step", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_step_recipe_id"), ["recipe_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("step", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_step_recipe_id"))

    op.drop_table("step")
    with op.batch_alter_table("recipe_ingredient", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_recipe_ingredient_ingredient_id"))

    op.drop_table("recipe_ingredient")
    with op.batch_alter_table("recipe", schema=None) as batch_op:
        batch_op.drop_index(
            "uq_recipe_featured", sqlite_where=sa.text("is_featured = 1"), postgresql_where=sa.text("is_featured")
        )
        batch_op.drop_index(batch_op.f("ix_recipe_slug"))
        batch_op.drop_index("ix_recipe_published")
        batch_op.drop_index("ix_recipe_category_published")

    op.drop_table("recipe")
    with op.batch_alter_table("ingredient", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_ingredient_normalized_name"))

    op.drop_table("ingredient")
    op.drop_table("image")
    op.drop_table("category")
    op.drop_table("admin_user")
