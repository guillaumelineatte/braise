"""Petites commandes d'admin :

python -m app.cli create-admin EMAIL          crée un admin (ou change son mot de passe)
python -m app.cli seed [--reset]              données de démo
python -m app.cli cleanup-images [--dry-run]  vire les images qui ne servent plus
python -m app.cli openapi [--output FICHIER]  exporte le schéma OpenAPI
"""

import argparse
import asyncio
import getpass
import json
import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy import func, select

from . import models
from .config import get_settings
from .db import make_engine, make_sessionmaker, utcnow
from .images import delete_image_files
from .security import hash_password
from .storage import make_storage

MIN_PASSWORD_LENGTH = 10


def _session_factory():
    settings = get_settings()
    engine = make_engine(settings.database_url)
    return engine, make_sessionmaker(engine), settings


async def create_admin(email: str, password: str) -> str:
    engine, sessionmaker, _ = _session_factory()
    try:
        async with sessionmaker() as session:
            email = email.strip().lower()
            user = await session.scalar(select(models.AdminUser).where(func.lower(models.AdminUser.email) == email))
            if user is None:
                session.add(models.AdminUser(email=email, hashed_password=hash_password(password)))
                action = "créé"
            else:
                user.hashed_password = hash_password(password)
                action = "mis à jour (nouveau mot de passe)"
            await session.commit()
            return action
    finally:
        await engine.dispose()


async def run_seed(reset: bool) -> dict[str, int]:
    from .seed import seed

    engine, sessionmaker, settings = _session_factory()
    try:
        async with sessionmaker() as session:
            return await seed(session, make_storage(settings), reset=reset)
    finally:
        await engine.dispose()


async def cleanup_images(dry_run: bool, min_age_hours: int) -> list[int]:
    """Supprime les images qui ne sont liées à aucune recette.

    On laisse les plus récentes (min_age_hours) : une image tout juste uploadée
    n'est pas encore rattachée à sa recette.
    """
    engine, sessionmaker, settings = _session_factory()
    storage = make_storage(settings)
    try:
        async with sessionmaker() as session:
            used = select(models.Recipe.image_id).where(models.Recipe.image_id.is_not(None))
            stmt = select(models.Image).where(
                models.Image.id.not_in(used),
                models.Image.created_at < utcnow() - timedelta(hours=min_age_hours),
            )
            orphans = list((await session.scalars(stmt)).all())
            if not dry_run:
                for image in orphans:
                    await delete_image_files(storage, image)
                    await session.delete(image)
                await session.commit()
            return [image.id for image in orphans]
    finally:
        await engine.dispose()


def export_openapi() -> dict:
    from .main import create_app

    return create_app().openapi()


def _read_password() -> str:
    if not sys.stdin.isatty():
        return sys.stdin.readline().rstrip("\n")
    first = getpass.getpass("Mot de passe : ")
    second = getpass.getpass("Confirmez : ")
    if first != second:
        raise SystemExit("Les deux saisies diffèrent.")
    return first


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Commandes de Braise.")
    commands = parser.add_subparsers(dest="command", required=True)

    admin = commands.add_parser("create-admin", help="Créer un administrateur (mot de passe demandé).")
    admin.add_argument("email")

    seed = commands.add_parser("seed", help="Catégories et recettes de démonstration.")
    seed.add_argument("--reset", action="store_true", help="Supprime d'abord toutes les recettes.")

    cleanup = commands.add_parser("cleanup-images", help="Supprimer les images orphelines.")
    cleanup.add_argument("--dry-run", action="store_true", help="Lister sans supprimer.")
    cleanup.add_argument("--min-age-hours", type=int, default=24)

    openapi = commands.add_parser("openapi", help="Exporter le schéma OpenAPI (JSON).")
    openapi.add_argument("--output", type=Path, help="Fichier de sortie (sinon : sortie standard).")

    args = parser.parse_args(argv)

    if args.command == "create-admin":
        password = _read_password()
        if len(password) < MIN_PASSWORD_LENGTH:
            raise SystemExit(f"Mot de passe trop court : {MIN_PASSWORD_LENGTH} caractères au minimum.")
        action = asyncio.run(create_admin(args.email, password))
        print(f"Administrateur {args.email} {action}.")
    elif args.command == "seed":
        result = asyncio.run(run_seed(args.reset))
        print(f"{result['categories']} catégories, {result['recipes_created']} recette(s) créée(s).")
    elif args.command == "cleanup-images":
        ids = asyncio.run(cleanup_images(args.dry_run, args.min_age_hours))
        verb = "à supprimer" if args.dry_run else "supprimée(s)"
        print(f"{len(ids)} image(s) orpheline(s) {verb}" + (f" : {ids}" if ids else "."))
    elif args.command == "openapi":
        payload = json.dumps(export_openapi(), ensure_ascii=False, indent=2) + "\n"
        if args.output:
            args.output.write_text(payload, encoding="utf-8")
            print(f"OpenAPI écrit dans {args.output}.")
        else:
            sys.stdout.write(payload)


if __name__ == "__main__":
    main()
