#!/usr/bin/env bash
# Mise en vente sous charge puis preuve de zéro survente, en une commande (scénario C-1).
#   tests/charge/lancer.sh            50 000 acheteurs (variable ACHETEURS pour changer)
# Le contrôle SQL tourne même si des seuils k6 échouent : la cohérence se vérifie dans tous les cas.
set -uo pipefail

DOSSIER="$(cd "$(dirname "$0")" && pwd)"

k6 run "$DOSSIER/mise-en-vente.js"
resultat_k6=$?

"$DOSSIER/verifier-survente.sh"
resultat_sql=$?

if [ "$resultat_sql" -ne 0 ]; then exit "$resultat_sql"; fi
exit "$resultat_k6"
