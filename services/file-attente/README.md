# File d'attente virtuelle (P2)

Service NestJS qui contrôle l'entrée dans une mise en vente : il absorbe le pic d'ouverture, affiche la position et le temps d'attente, puis admet les acheteurs au débit réglé en leur donnant un **jeton d'accès signé et limité dans le temps**. Décisions : ADR 008 (file), 009 (suivi de position), 011 (jetons), 010 (authentification).

- **Adresse publique, via Traefik : `http://localhost:8000/api/file`** (avec limitation de débit). C'est celle que doivent utiliser l'application web et les tests de charge.
- Accès direct, pour le développement uniquement (sans limitation) : `http://localhost:3001` · depuis un conteneur : `http://file-attente:3000`
- Stockage : Redis (`file:{événement}`, `admis:{événement}:{acheteur}`, `vente:{événement}`)

## Règles

| Règle                             | Comment                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Protection contre les robots**  | Quatre couches (ADR 012) : limitation de débit par IP dans Traefik, preuve de travail **ALTCHA** à chaque entrée, compte obligatoire, une seule position par compte                              |
| **Compte obligatoire**            | Jeton Keycloak avec le rôle `acheteur` (audience `ticketrush-api`)                                                                                                                               |
| **Une seule position par compte** | Entrer plusieurs fois (onglets, appareils) renvoie la même place. Un acheteur déjà admis n'est pas remis en file                                                                                 |
| **Équité**                        | Arrivés **avant** l'ouverture : ordre **tiré au sort**. Arrivés **après** : premier arrivé, premier servi. Tous ceux d'avant passent avant ceux d'après                                          |
| **Admission**                     | Un worker admet chaque seconde les N premiers (N = débit par seconde). Un verrou Redis garantit qu'une seule instance admet à chaque tour. Rien avant l'ouverture                                |
| **Jeton d'accès**                 | JWT **ES256**, valable **10 minutes**, lié à l'acheteur (`sub`) et à la vente (`evt`), audience `reservation`, identifiant unique `jti`. Le Cœur le vérifie avec la clé publique publiée en JWKS |

## API

Les appels acheteurs exigent `Authorization: Bearer <jeton Keycloak>`.

### `GET /files/{evenementId}/defi` — obtenir un défi anti-robots (rôle `acheteur`)

Renvoie un défi ALTCHA, au format attendu par le widget ALTCHA côté navigateur. Il est valable 5 minutes et ne sert qu'une fois.

### `POST /files/{evenementId}/entrer` — entrer dans la file (rôle `acheteur`)

Le corps contient la preuve de travail produite par le widget (base64 du défi et de sa solution) :

```json
{ "altcha": "eyJjaGFsbGVuZ2UiOnsi…" }
```

| Cas                                                                 | Réponse                    |
| ------------------------------------------------------------------- | -------------------------- |
| Preuve absente                                                      | `400`                      |
| Preuve fausse, signée par un autre secret, expirée ou déjà utilisée | `403`                      |
| Plus de 5 requêtes en rafale depuis une même IP (entrée et défi)    | `429`, renvoyé par Traefik |

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

## Protection contre les robots (ADR 012)

**Limitation de débit, dans Traefik, par adresse IP :**

| Routes                                            | Moyenne                 | Rafale |
| ------------------------------------------------- | ----------------------- | ------ |
| `…/defi` et `…/entrer`                            | 2 requêtes par seconde  | 5      |
| Toutes les autres (position, clé publique, santé) | 20 requêtes par seconde | 40     |

La limite est comptée par instance de Traefik (registre de dette, D-006). Des acheteurs derrière une même adresse IP partagée se partagent la limite : elle reste volontairement assez haute.

**ALTCHA**, auto-hébergé, sans service externe :

| Variable            | Rôle                                                                                                                                                | Défaut   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `ALTCHA_ACTIF`      | `false` désactive la preuve de travail. **Uniquement pour le test de charge**, à signaler dans son rapport. Un avertissement s'affiche au démarrage | `true`   |
| `ALTCHA_SECRET`     | Secret HMAC qui signe les défis. Vide : généré au démarrage (une seule instance, D-015)                                                             | vide     |
| `ALTCHA_DIFFICULTE` | Compteur maximal à essayer. Plus grand = plus long à résoudre. À calibrer sur un téléphone modeste (environ 1 s visé)                               | `100000` |

Avec la difficulté par défaut, un défi se résout en moins de 0,1 s sur un ordinateur récent. Un robot qui veut 10 000 positions doit fournir 10 000 calculs, alors qu'un humain ne le paie qu'une fois.

## Clé de signature

Variable `FILE_JETON_CLE_PRIVEE_PEM` (`.env.example`) : clé privée EC P-256 au format PKCS#8. **Absente**, une clé est générée au démarrage, ce qui suffit avec une seule instance. Mais elle change à chaque redémarrage, et les jetons émis avant deviennent invalides (registre de dette, D-015).

## Organisation du code (ADR 020)

- `src/domaine/` : règles pures (score d'entrée, attente estimée, prochain appel) et ports
- `src/application/` : cas d'usage `FileAttente` (entrer, consulter, tour d'admission)
- `src/infrastructure/` : Redis, signature des jetons, protection ALTCHA, worker d'admission, HTTP et rôles

Tests : `pnpm --filter @ticketrush/file-attente test` (démarrent un vrai Redis dans Docker : Docker Desktop doit tourner).
