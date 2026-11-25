# Faux prestataire de paiement (P2)

Service NestJS qui simule un prestataire de paiement externe : il **accepte ou refuse** un paiement. Il sert au paiement simulé du squelette, et le comité le coupera en soutenance.

- Adresse depuis la machine : `http://localhost:3003` · depuis un conteneur : `http://faux-paiement:3000`
- Couper le paiement : `docker compose stop faux-paiement` · le relancer : `docker compose start faux-paiement`
- Les paiements sont gardés **en mémoire** : un arrêt les efface, comme pour un prestataire externe redémarré.

## Authentification (ADR 010)

Chaque appel à `/paiements` exige un **jeton de service Keycloak** destiné à ce service (audience `ticketrush-faux-paiement`). Le Cœur l'obtient avec le client `ticketrush-coeur` et le flux `client_credentials` (voir [`infra/keycloak`](../../infra/keycloak/README.md)). Sans jeton valide : `401`.

## API

### `POST /paiements` — créer un paiement

En-têtes obligatoires : `Authorization: Bearer <jeton>` et `Idempotency-Key: <clé unique par paiement>` (ADR 005).

```json
{
  "reference": "reservation-123",
  "montantCentimes": 6500,
  "devise": "EUR",
  "moyenDePaiement": { "jeton": "carte-acceptee" }
}
```

Réponse `201` :

```json
{
  "id": "3f6c…",
  "reference": "reservation-123",
  "montantCentimes": 6500,
  "devise": "EUR",
  "statut": "accepte",
  "motifRefus": null,
  "creeLe": "2026-11-25T10:00:00.000Z"
}
```

| Cas                                           | Réponse                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `moyenDePaiement.jeton` = `carte-refusee`     | `201`, `statut: "refuse"` avec un `motifRefus`                                            |
| Tout autre jeton                              | `201`, `statut: "accepte"`                                                                |
| Même `Idempotency-Key` et même demande        | Le **même** paiement, avec l'en-tête `Idempotent-Replayed: true` : jamais de double débit |
| Même `Idempotency-Key`, demande différente    | `422`                                                                                     |
| `Idempotency-Key` absente ou demande invalide | `400`                                                                                     |

### `GET /paiements/{id}` — relire un paiement

`200` avec le paiement, ou `404`.

### `GET /sante` — santé (sans authentification)

`200 {"statut":"ok"}`, utilisé par le contrôle de santé du Compose.

## Organisation du code (ADR 020)

- `src/domaine/` : la règle de décision et le port `DepotPaiements`, sans dépendance à NestJS
- `src/application/` : le cas d'usage `CreerPaiement`, avec l'idempotence
- `src/infrastructure/` : HTTP (contrôleurs, vérification du jeton), dépôt en mémoire, configuration

Tests : `pnpm --filter @ticketrush/faux-paiement test`
