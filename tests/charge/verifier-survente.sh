#!/usr/bin/env bash
# Lance le contrôle de survente (controle-survente.sql) dans le conteneur PostgreSQL du Compose.
#   tests/charge/verifier-survente.sh [evenementId]
# Code de sortie 0 : zéro survente ; autre : violation ou erreur.
set -euo pipefail

EVENEMENT="${1:-${EVENEMENT:-7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50}}"
DOSSIER="$(cd "$(dirname "$0")" && pwd)"

docker compose exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -v evenement="$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' \
  _ "$EVENEMENT" <"$DOSSIER/controle-survente.sql"
