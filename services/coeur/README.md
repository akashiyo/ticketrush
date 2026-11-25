# Cœur (P1)

Monolithe modulaire NestJS (ADR 001, 002) : **Réservation** pour l'instant ; Catalogue et
Organisateurs s'ajouteront à côté. Il porte la garantie **zéro survente** (ADR 003, scénario C-1).

## Organisation du code (ADR 020)

```
src/
├── main.ts, app.module.ts      assemblage : ne branche les modules que par leur api/
├── commun/                     configuration, base PostgreSQL (Drizzle), contrôle de santé
├── reservation/
│   ├── domaine/                blocage, admission, erreurs, ports — sans aucune bibliothèque
│   ├── application/            cas d'usage BloquerPlace — n'utilise que les ports
│   ├── infrastructure/         PostgreSQL (schéma, migrations, dépôt), jose, module NestJS
│   └── api/                    seul point d'entrée visible des autres modules
└── test/                       utilitaires des tests (PostgreSQL via Testcontainers)
```

## Ce qui est en place

| Élément                                                                                              | Où                                                    | Décision     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------ |
| Blocage atomique d'un siège : un seul `UPDATE` conditionnel                                          | `reservation/infrastructure/depot-sieges-postgres.ts` | ADR 003      |
| Placement libre : `FOR UPDATE SKIP LOCKED`                                                           | idem                                                  | ADR 003      |
| Expiration : une place bloquée depuis plus de 10 min redevient réservable, heure lue dans PostgreSQL | idem                                                  | ADR 003      |
| Contrainte `UNIQUE (evenement_id, siege_id)` sur les billets                                         | `reservation/infrastructure/schema.ts`                | ADR 003      |
| Événement `PlaceBloquee` écrit dans l'Outbox, même transaction                                       | idem                                                  | ADR 007      |
| Vérification locale du jeton d'accès de la File (ES256, `iss`, `aud`, `exp`, `sub`, `evt`)           | `verificateur-admission-jose.ts`, `bloquer-place.ts`  | ADR 011, S-2 |
| Migrations par module, appliquées au démarrage                                                       | `migrations-reservation.ts`                           | ADR 002, 022 |
| Règles de dépendances (fonction de fitness)                                                          | `.dependency-cruiser.cjs`                             | ADR 021, M-3 |

Pas encore : l'API HTTP (contrôleur, jeton Keycloak), le paiement, l'émission du billet, le relais
de l'Outbox vers Redpanda, le worker d'expiration, l'anti-rejeu du `jti` (en discussion avec P2).

## Commandes

| Commande                                                 | Effet                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm --filter @ticketrush/coeur test`                   | Tests unitaires et d'intégration                                            |
| `pnpm --filter @ticketrush/coeur dependances`            | Vérifie les règles de dépendances                                           |
| `pnpm --filter @ticketrush/coeur migrations:reservation` | Génère une migration après modification de `schema.ts` (puis `pnpm format`) |
| `pnpm --filter @ticketrush/coeur... build`               | Compile les contrats puis le Cœur                                           |

Les tests d'intégration démarrent un vrai PostgreSQL 18 dans Docker (Testcontainers). Sans Docker
sur la machine, ils sont **sautés** ; en CI (variable `CI`), ils ne le sont jamais.

## Configuration

| Variable             | Défaut                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PORT`               | `3000`                                                                                                                 |
| `DATABASE_URL`       | `postgres://ticketrush:ticketrush_dev@localhost:5432/ticketrush`                                                       |
| `ADMISSION_JWKS_URL` | `http://localhost:3001/.well-known/jwks.json` (depuis un conteneur : `http://file-attente:3000/.well-known/jwks.json`) |
| `ADMISSION_EMETTEUR` | `ticketrush-file-attente`                                                                                              |

Image : `docker build -f services/coeur/Dockerfile .` depuis la racine. Le service n'est pas encore
dans le `docker-compose.yml` (à ajouter avec P2 à l'intégration du jalon 2).
