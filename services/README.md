# services — Unités déployables (ADR 001 et 002)

| Dossier          | Propriétaire | Rôle                                                        |
| ---------------- | ------------ | ----------------------------------------------------------- |
| `coeur/`         | P1           | Monolithe modulaire : Catalogue, Réservation, Organisateurs |
| `file-attente/`  | P2           | Entrée, position, admission, jetons d'accès                 |
| `analytique/`    | P2           | Traitement du flux de ventes, dashboard en direct           |
| `faux-paiement/` | P2           | Prestataire de paiement simulé et instable                  |

Chaque service est un paquet NestJS du workspace pnpm.
