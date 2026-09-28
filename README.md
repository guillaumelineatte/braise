# Braise

Un site de recettes avec son back-office. Tout ce qui s'affiche sur le site (recettes, catégories, compteurs, recette mise en avant, recherche) vient de l'API et se gère depuis `/admin`. On crée une recette, on la publie, elle est en ligne.

- Design : [DESIGN.md](DESIGN.md), et la maquette de référence dans [design/prototype.html](design/prototype.html)
- API : FastAPI (Python 3.12), SQLAlchemy 2 en async, Alembic, Pydantic v2. Doc sur `/api/docs`
- Front : React 18 + TypeScript, Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind (juste pour les tokens), Framer Motion, dnd-kit, Lenis

```
.
├── DESIGN.md
├── design/prototype.html
├── docker-compose.yml     api + front (nginx) + postgres
├── .env.example
├── backend/
│   ├── app/               l'API (routers/, services/, cli.py, seed.py...)
│   ├── alembic/           migrations
│   ├── tests/
│   └── openapi.json       schéma OpenAPI, utilisé par les tests du front
└── frontend/
    ├── index.html
    └── src/
        ├── api/           client, schémas Zod, requêtes
        ├── components/    composants (et admin/ pour l'éditeur)
        ├── pages/
        └── styles/
```

## Lancer en local

Il faut Python 3.12 et Node 22.12+. Pas besoin de Postgres en dev, SQLite suffit.

### API

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"            # ".[dev,s3]" pour le stockage S3
cp ../.env.example ../.env         # optionnel, les valeurs par défaut marchent en dev

alembic upgrade head               # crée braise.db
python -m app.cli create-admin vous@exemple.fr   # demande un mot de passe (10 caractères min.)
python -m app.cli seed             # 5 catégories et 10 recettes

uvicorn app.main:app --reload      # http://localhost:8000
```

### Front

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173, /api et /media sont proxyfiés vers :8000
```

- Site : http://localhost:5173
- Admin : http://localhost:5173/admin
- Tous les composants sur une page (dev seulement) : http://localhost:5173/dev/components

## Docker

```bash
cp .env.example .env
# dans .env : SECRET_KEY (obligatoire, 32 caractères aléatoires minimum)
# et ADMIN_EMAIL / ADMIN_PASSWORD pour créer le premier compte admin
docker compose up --build
```

Le site tourne sur http://localhost:8080 (admin sur `/admin`).

- `postgres` garde ses données dans le volume `pgdata`
- `api` lance les migrations au démarrage, les images vont dans le volume `media`
- `front` est un nginx qui sert le build et proxy `/api`, `/media`, `/sitemap.xml` et `/robots.txt`

Avec `SEED_ON_START=true` (par défaut) les recettes de démo sont ajoutées au premier démarrage. On peut relancer sans risque, ça ne crée pas de doublons.

En prod il faut mettre un reverse proxy avec TLS devant `front`.

## Compte admin

Soit avec la commande `python -m app.cli create-admin EMAIL` (si le compte existe déjà, ça change juste son mot de passe). Avec Docker : `docker compose exec api python -m app.cli create-admin EMAIL`.

Soit avec `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans le `.env` : le compte est créé au démarrage s'il n'y a encore aucun admin.

Mots de passe en argon2, session JWT de 24 h.

## Données de démo

`python -m app.cli seed` ajoute les 5 catégories (Entrées, Plats, Pâtisserie, Pains, Apéritif) et 10 recettes publiées, 2 par catégorie. Les images sont des dégradés générés avec Pillow en attendant de vraies photos. `--reset` supprime toutes les recettes avant.

## Commandes

| Commande | |
|---|---|
| `python -m app.cli create-admin EMAIL` | crée un admin ou change son mot de passe |
| `python -m app.cli seed [--reset]` | données de démo |
| `python -m app.cli cleanup-images [--dry-run] [--min-age-hours 24]` | supprime les images qui ne servent plus (supprimer une recette ne supprime pas son image) |
| `python -m app.cli openapi --output openapi.json` | regénère `openapi.json` |
| `alembic upgrade head` | migrations |

## Variables d'environnement

Elles sont toutes dans [.env.example](.env.example) avec un commentaire. L'API lit `backend/.env` puis `.env` à la racine. Les principales :

| Variable | Par défaut | |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./braise.db` | `postgresql+asyncpg://...` en prod (`postgres://` marche aussi) |
| `SECRET_KEY` | clé de dev | signe les JWT, obligatoire en prod |
| `ENVIRONMENT` | `development` | mettre `production` en prod |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS, plusieurs origines séparées par des virgules |
| `SITE_URL` | `http://localhost:5173` | pour `sitemap.xml` et `robots.txt` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | premier admin |
| `STORAGE_BACKEND` | `local` | `local` ou `s3` (voir les variables `S3_*`) |
| `MAX_UPLOAD_MB` | `12` | taille max d'une image |
| `VITE_API_URL` | | seulement si l'API est sur un autre domaine que le front |

## Tests

```bash
cd backend && pytest

# sur Postgres
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/braise_test pytest

cd frontend && npm test && npm run typecheck
```

Côté front, un test vérifie que les schémas Zod collent à `backend/openapi.json`. Donc si on touche aux schémas Pydantic : `python -m app.cli openapi --output openapi.json`, puis on met à jour `frontend/src/api/schemas.ts`.

## Notes

**Éditeur.** Le brouillon est créé dès qu'on tape le titre. Ensuite chaque modif part en `PATCH` 2 s après la dernière frappe (et tout de suite si on change d'onglet ou qu'on ferme la page). ⌘S envoie un `PUT` complet. Quand on publie une recette incomplète, l'API répond 422 `incomplete` avec la liste de ce qui manque et l'éditeur scrolle jusqu'à la première section concernée.

**Règles côté serveur.**
- le slug est généré depuis le titre et ne bouge plus après la première publication (sauf avec `force_slug`)
- on ne peut publier qu'une recette complète, et une recette publiée ne peut pas redevenir incomplète
- une seule recette mise en avant à la fois (il y a aussi un index unique partiel en base)
- les calories doivent correspondre à peu près à 4P + 4G + 9L : avertissement au-dessus de 15 % d'écart, publication bloquée au-dessus de 40 %
- impossible de supprimer une catégorie qui a encore des recettes (409)

**Recherche.** Sur le titre, la description et les ingrédients, sans tenir compte des accents. Sous Postgres on utilise `unaccent` et `pg_trgm` si les extensions sont dispo (la migration essaie de les créer), sinon `translate()` + `ILIKE`.

**Images.** Upload en JPEG, PNG ou WebP. L'API applique l'orientation EXIF, recadre si besoin, génère du WebP en 320, 800 et 1600 px plus une mini version floue pour le chargement. Stockage en local ou sur S3.

**Cache.** La partie publique de l'API renvoie `Cache-Control: public, max-age=60, stale-while-revalidate=300`, l'admin `no-store`.

**Perf.** L'admin, Zod, dnd-kit et Lenis ne sont pas chargés sur le site public. `index.html` lance tout de suite les requêtes de la page (données, image principale, JS de la route) et affiche la nav et l'image avant que React démarre. Lighthouse mobile en build de prod : autour de 94-95 en perf, 100 en accessibilité, bonnes pratiques et SEO.
