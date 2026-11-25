# File d'attente virtuelle (P2)

Service NestJS qui contrôle l'entrée dans une mise en vente : il absorbe le pic d'ouverture, affiche la position et le temps d'attente, puis admet les acheteurs au débit réglé en leur donnant un **jeton d'accès signé et limité dans le temps**. Décisions : ADR 008 (file), 009 (suivi de position), 011 (jetons), 010 (authentification).

- Adresse depuis la machine : `http://localhost:3001` · depuis un conteneur : `http://file-attente:3000`
- Stockage : Redis (`file:{événement}`, `admis:{événement}:{acheteur}`, `vente:{événement}`)

## Règles

| Règle                             | Comment                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Compte obligatoire**            | Jeton Keycloak avec le rôle `acheteur` (audience `ticketrush-api`)                                                                                                                               |
| **Une seule position par compte** | Entrer plusieurs fois (onglets, appareils) renvoie la même place. Un acheteur déjà admis n'est pas remis en file                                                                                 |
| **Équité**                        | Arrivés **avant** l'ouverture : ordre **tiré au sort**. Arrivés **après** : premier arrivé, premier servi. Tous ceux d'avant passent avant ceux d'après                                          |
| **Admission**                     | Un worker admet chaque seconde les N premiers (N = débit par seconde). Un verrou Redis garantit qu'une seule instance admet à chaque tour. Rien avant l'ouverture                                |
| **Jeton d'accès**                 | JWT **ES256**, valable **10 minutes**, lié à l'acheteur (`sub`) et à la vente (`evt`), audience `reservation`, identifiant unique `jti`. Le Cœur le vérifie avec la clé publique publiée en JWKS |

## API

Les appels acheteurs exigent `Authorization: Bearer <jeton Keycloak>`.

### `POST /files/{evenementId}/entrer` — entrer dans la file (rôle `acheteur`)

### `GET /files/{evenementId}/position` — suivre sa position (rôle `acheteur`)

Les deux renvoient l'état de l'acheteur :

```json
{
  "statut": "en_attente",
  "position": 18342,
  "attenteEstimeeSec": 92,
  "prochainAppelDansSec": 30,
  "ouvertureLe": "2026-12-01T10:00:00.000Z"
}
```

```json
{ "statut": "admis", "jetonAcces": "eyJhbGciOiJFUzI1NiIs…", "expireLe": "2026-12-01T10:12:00.000Z" }
```

`{ "statut": "absent" }` si l'acheteur n'est pas dans la file. `404` si la vente n'est pas configurée.

Le client doit rappeler `GET …/position` après `prochainAppelDansSec` secondes : 2 s près de l'admission, jusqu'à 30 s loin dans la file (ADR 009).

### `PUT /files/{evenementId}/vente` — configurer la vente (rôle `organisateur-admin`)

```json
{ "ouvertureLe": "2026-12-01T10:00:00Z", "debitParSeconde": 200 }
```

Réponse `204`. Le débit peut être modifié pendant la vente.

> **Provisoire** : cet appel sera remplacé par la lecture de l'événement `EvenementPublie` du Cœur, une fois les contrats écrits avec P1. Il ne vérifie pas encore que l'organisateur possède l'événement (registre de dette, D-014).

### `GET /.well-known/jwks.json` — clé publique des jetons d'admission (public)

C'est l'adresse que le Cœur utilise pour vérifier les jetons : `http://file-attente:3000/.well-known/jwks.json` depuis un conteneur.

### `GET /sante` — santé (public)

## Clé de signature

Variable `FILE_JETON_CLE_PRIVEE_PEM` (`.env.example`) : clé privée EC P-256 au format PKCS#8. **Absente**, une clé est générée au démarrage, ce qui suffit avec une seule instance. Mais elle change à chaque redémarrage, et les jetons émis avant deviennent invalides (registre de dette, D-015).

## Organisation du code (ADR 020)

- `src/domaine/` : règles pures (score d'entrée, attente estimée, prochain appel) et ports
- `src/application/` : cas d'usage `FileAttente` (entrer, consulter, tour d'admission)
- `src/infrastructure/` : Redis, signature des jetons, worker d'admission, HTTP et rôles

Tests : `pnpm --filter @ticketrush/file-attente test` (démarrent un vrai Redis dans Docker : Docker Desktop doit tourner).
