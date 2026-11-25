# TicketRush

Billetterie pour concerts et événements sportifs, capable d'absorber le pic d'ouverture d'une vente sans jamais vendre deux fois la même place. Projet ESGI M1 Architecte logiciel.

## Prérequis

- Node.js 24 (voir `.node-version`)
- pnpm 10 : `npm install -g pnpm@10`
- Docker Desktop (à partir de l'étape Docker Compose)

## Commandes

| Commande            | Effet                                         |
| ------------------- | --------------------------------------------- |
| `pnpm install`      | Installe les dépendances de tout le monorepo  |
| `pnpm build`        | Compile tous les paquets (`pnpm -r build`)    |
| `pnpm typecheck`    | Vérifie les types de tous les paquets         |
| `pnpm lint`         | Lance ESLint sur tout le dépôt                |
| `pnpm format`       | Formate le code avec Prettier                 |
| `pnpm format:check` | Vérifie le formatage sans modifier de fichier |

## Organisation du dépôt

| Dossier              | Propriétaire                    | Contenu                                             |
| -------------------- | ------------------------------- | --------------------------------------------------- |
| `apps/web/`          | Partagé                         | Application web React + Vite                        |
| `services/`          | P1 (`coeur/`) · P2 (les autres) | Unités déployables NestJS                           |
| `packages/contrats/` | Partagé                         | Contrats entre P1 et P2 : jetons, événements, API   |
| `infra/`             | P2                              | Traefik, Keycloak, observabilité                    |
| `tests/charge/`      | Partagé                         | Tests de charge k6                                  |
| `docs/`              | Partagé                         | ADR, registre de dette, post-mortems, dossier arc42 |

Les décisions d'architecture sont dans [`docs/adr/`](docs/adr/liste-adr.md).
