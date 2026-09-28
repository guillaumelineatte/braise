#!/bin/sh
# migrations à chaque démarrage, + données de démo si SEED_ON_START=true (pas de doublons)
set -e
alembic upgrade head
if [ "${SEED_ON_START:-false}" = "true" ]; then
  python -m app.cli seed
fi
exec "$@"
