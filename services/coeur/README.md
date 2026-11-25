# Cœur (P1)

Monolithe modulaire NestJS (ADR 001, 002) : **Catalogue** (côté lecture) et **Réservation** ;
Organisateurs s'ajoutera à côté. Il porte la garantie **zéro survente** (ADR 003, scénario C-1).

- Via Traefik : `http://localhost:8000/api/…` · accès direct (développement) : `http://localhost:3002`
- Démarré par `docker compose up -d`, avec une **vente de démonstration** de 5 000 places
  (3 000 en fosse à 45 €, 2 000 numérotées A-1 à T-100 à 65 €) :
  événement `7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50`, fosse `…4e51`, catégorie 1 `…4e52`.

## API du Catalogue (publique, sans connexion)

| Route                                                                                  | Effet                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /catalogue/recherche?q=&ville=&genre=&du=AAAA-MM-JJ&au=AAAA-MM-JJ&page=&parPage=` | Recherche (fautes de frappe tolérées), filtres, tri par date ; servie par **Meilisearch seul** (ADR 014). `503` si l'index est indisponible |
| `GET /catalogue/evenements/{id}`                                                       | Fiche d'un événement publié : salle, date, catégories, prix ; **cache-aside Redis** (ADR 015). `404` si inconnu                             |

Chemin CQRS (ADR 014) : le Catalogue écrit dans le schéma `catalogue` et, dans la même transaction,
`EvenementPublie` dans son Outbox → relais vers `catalogue.evenements` → projection (groupe
`coeur-projection-catalogue`) → index `evenements` de Meilisearch. La projection ignore toute
version plus ancienne que celle indexée : rejouer le topic reconstruit l'index à l'identique.
`EvenementModifie` et `TarifModifie` invalident aussi la fiche en cache.

Cache des fiches (ADR 015) : 10 min ± 10 %, un seul rechargement à la fois (verrou Redis contre
l'avalanche), fiche inconnue retenue 30 s, lecture directe en base si Redis est en panne.

Données de démonstration : 5 événements fictifs (Lyon, Nantes, Lille, Paris) ; le premier est la
vente de 5 000 places.

## API de la Réservation

Toutes les routes exigent `Authorization: Bearer <jeton Keycloak>` avec le rôle `acheteur`.

### `POST /evenements/{evenementId}/blocages` — bloquer une place 10 minutes

En-tête `Jeton-Acces: <jeton remis par la File d'attente>`. Corps : `{ "siegeId": "…" }` (siège
numéroté) ou `{ "categorieId": "…" }` (placement libre).

| Cas                                                                              | Réponse                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Place bloquée                                                                    | `201 { reservationId, siegeId, categorieId, bloqueJusqua }` |
| Jeton d'accès absent, invalide, expiré, d'un autre acheteur ou d'une autre vente | `403`                                                       |
| Place déjà prise, ou plus de place libre dans la catégorie                       | `409`                                                       |

### `POST /reservations/{reservationId}/paiement` — payer et recevoir le billet

En-tête `Idempotency-Key` obligatoire (8 à 64 caractères, une clé par intention de payer). Corps :
`{ "moyenDePaiement": { "jeton": "carte-acceptee" } }` (`carte-refusee` provoque un refus).

| Cas                                                                        | Réponse               |
| -------------------------------------------------------------------------- | --------------------- |
| Paiement accepté, billet émis ; ou réservation déjà payée (même réponse)   | `201 { billetId, … }` |
| Paiement refusé (la place reste bloquée : on peut réessayer)               | `402`                 |
| Réservation inconnue ou d'un autre acheteur                                | `404`                 |
| Blocage expiré, ou qui expire dans moins de 15 s                           | `409`                 |
| Prestataire lent, en erreur ou disjoncteur ouvert (la place reste bloquée) | `503`                 |

### `GET /sante`

`200` si PostgreSQL répond.

## Ce qui garantit quoi

| Garantie                    | Comment                                                                                                                                                                                                        | Où                                                                        | Décision     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------ |
| Zéro survente               | Un seul `UPDATE` conditionnel par blocage ; `FOR UPDATE SKIP LOCKED` en fosse ; billet émis seulement si la place est encore bloquée par cette réservation ; `UNIQUE (evenement_id, siege_id)` sur les billets | `depot-sieges-postgres.ts`, `depot-reservations-postgres.ts`, `schema.ts` | ADR 003      |
| Expiration                  | Une place bloquée depuis plus de 10 min se reprend aussitôt ; un worker la libère toutes les 5 s                                                                                                               | idem, `taches-periodiques.ts`                                             | ADR 003      |
| Aucun événement perdu       | `PlaceBloquee`, `BlocageExpire`, `BilletEmis` écrits dans l'Outbox dans la transaction métier ; relais vers Redpanda toutes les 200 ms, au moins une fois                                                      | `outbox/`                                                                 | ADR 007      |
| Prestataire en panne        | Délai 2 s, 3 appels au plus avec délai croissant et aléatoire, même clé d'idempotence, disjoncteur (> 50 % d'échecs → refus immédiat 30 s)                                                                     | `paiement/`                                                               | ADR 005, D-1 |
| Idempotence de bout en bout | `Idempotency-Key` du navigateur → clé envoyée au prestataire ; réservation payée → même billet                                                                                                                 | `payer-reservation.ts`                                                    | ADR 005      |
| Jetons d'accès              | ES256, `iss`, `aud`, `exp` vérifiés localement ; `sub` = acheteur, `evt` = vente                                                                                                                               | `verificateur-admission-jose.ts`, `bloquer-place.ts`                      | ADR 011, S-2 |
| Frontières                  | Domaine sans bibliothèque, modules par leur `api/`, aucun cycle, aucun autre service                                                                                                                           | `.dependency-cruiser.cjs`                                                 | ADR 021, M-3 |

PostgreSQL **18** est requis : le blocage lit l'état précédent de la ligne avec `RETURNING old.*`.

Pas encore : l'anti-rejeu du `jti` (en discussion avec P2), plusieurs places par réservation, le
remboursement d'une réservation `a_rembourser` (compensation hors périmètre), la purge des lignes
publiées de l'Outbox, les traces OpenTelemetry (`traceparent` est prévu dans l'Outbox).

## Organisation du code (ADR 020)

```
src/
├── main.ts, app.module.ts      assemblage : ne branche les modules que par leur api/
├── commun/                     configuration, PostgreSQL, authentification Keycloak, santé
├── reservation/
│   ├── domaine/                blocage, réservation, paiement, erreurs, ports — sans bibliothèque
│   ├── application/            BloquerPlace, PayerReservation — n'utilisent que les ports
│   ├── infrastructure/         PostgreSQL, HTTP, paiement, Outbox, tâches périodiques, NestJS
│   └── api/                    seul point d'entrée visible des autres modules
└── test/                       utilitaires des tests (PostgreSQL via Testcontainers)
```

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

| Variable                                                             | Défaut (hors Docker)                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `PORT`                                                               | `3000`                                                                   |
| `DATABASE_URL`                                                       | `postgres://ticketrush:ticketrush_dev@localhost:5432/ticketrush`         |
| `AUTH_EMETTEUR`, `AUTH_JWKS_URL`, `AUTH_AUDIENCE`                    | Keycloak sur `localhost:8180`, audience `ticketrush-api`                 |
| `ADMISSION_JWKS_URL`, `ADMISSION_EMETTEUR`                           | `http://localhost:3001/.well-known/jwks.json`, `ticketrush-file-attente` |
| `PAIEMENT_URL`                                                       | `http://localhost:3003`                                                  |
| `PAIEMENT_JETON_URL`, `PAIEMENT_CLIENT_ID`, `PAIEMENT_CLIENT_SECRET` | jeton de service Keycloak du client `ticketrush-coeur`                   |
| `KAFKA_BROKERS`                                                      | `localhost:19092`                                                        |
| `REDIS_URL`                                                          | `redis://localhost:6379`                                                 |
| `MEILI_URL`, `MEILI_CLE`                                             | `http://localhost:7700`, clé maître de développement                     |
| `RELAIS_INTERVALLE_MS`, `EXPIRATION_INTERVALLE_MS`                   | `200`, `5000` (`0` désactive)                                            |
| `DONNEES_DEMO`                                                       | `false` (`true` dans le Compose)                                         |
