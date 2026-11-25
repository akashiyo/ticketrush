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
| `pnpm test`         | Lance les tests Vitest de tous les paquets    |

La CI GitHub Actions (`.github/workflows/ci.yml`) rejoue ces vérifications à chaque push et chaque pull request.

## Infrastructure locale (Docker Compose)

Docker Desktop doit être lancé. Tout démarre en une commande :

```
docker compose up -d
```

| Service     | Adresse depuis la machine                                      | Rôle                                    |
| ----------- | -------------------------------------------------------------- | --------------------------------------- |
| PostgreSQL  | `localhost:5432` (base, utilisateur `ticketrush`)              | Source de vérité du Cœur (ADR 004)      |
| Redis       | `localhost:6379`                                               | File d'attente, jetons, cache, agrégats |
| Redpanda    | Kafka `localhost:19092`, registre de schémas `localhost:18081` | Événements (ADR 006)                    |
| Meilisearch | `http://localhost:7700`                                        | Recherche dans le catalogue (ADR 014)   |

- `docker compose ps` : état des conteneurs (tous doivent être `healthy`).
- `docker compose down` : arrêt. Ajouter `-v` pour effacer aussi les données.
- Les mots de passe par défaut sont des valeurs de développement. Pour les changer, copier `.env.example` en `.env`.

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
