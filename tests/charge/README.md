# tests/charge — Tests de charge k6

Partagé :

- **P2** : entrée dans la file, interrogation de la position, récupération du jeton.
- **P1** : réservation, paiement, et requêtes SQL de contrôle de survente.

Objectif : 50 000 acheteurs virtuels pour 5 000 places, zéro survente (scénario C-1, ADR 003). Une version réduite tourne en CI (ADR 021).

## Lancer

```
node tests/charge/identite-de-test/generer.mjs 2000          # jetons d'acheteur (un compte chacun)
docker compose -f docker-compose.yml -f docker-compose.charge.yml up -d --wait
ACHETEURS=2000 tests/charge/lancer.sh      # k6 run mise-en-vente.js, puis le contrôle de survente
tests/charge/verifier-survente.sh          # le contrôle seul, sur la vente de démonstration
```

Le test utilise la **surcouche de charge** `docker-compose.charge.yml` : les acheteurs virtuels ont
des jetons pré-générés, signés par une identité de test au lieu de Keycloak (au pic, Keycloak n'est
pas appelé, ADR 010 ; dette D-023), et les défis ALTCHA sont désactivés (dette D-010). Générer
autant de jetons que d'acheteurs (`ACHETEURS`) : un acheteur = un compte, une position.

La vente de démonstration de 5 000 places (`7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50`) est chargée
par le Cœur au démarrage ; le test l'ouvre dans la File (`setup()`). Les acheteurs arrivent à débit
constant pendant une minute (P-1). Le test vise la File et le Cœur en direct
(`BASE_FILE=http://localhost:3001`, `BASE_COEUR=http://localhost:3002`) : la limite de débit de
Traefik, comptée par adresse IP, bloquerait un test lancé depuis une seule machine (dette D-024).

**En CI** (ADR 021, fonction de fitness n° 3) : job « performance » de `.github/workflows/ci.yml`,
2 000 acheteurs à chaque poussée, seuils k6 puis contrôle de survente.

## Fichiers

| Fichier                 | Rôle                                                                                       | Piste |
| ----------------------- | ------------------------------------------------------------------------------------------ | ----- |
| `mise-en-vente.js`      | Scénario : chaque acheteur entre dans la file, puis réserve et paie ; seuils P-1, P-2, D-3 | P1+P2 |
| `lib/file-attente.js`   | Ouverture de la vente, entrée dans la file, suivi de la position jusqu'à l'admission       | P2    |
| `identite-de-test/`     | Génère les jetons des acheteurs et la clé publique servie par `docker-compose.charge.yml`  | P2    |
| `lib/reservation.js`    | Blocage (3 essais si la place est prise), paiement (même `Idempotency-Key` sur un 503)     | P1    |
| `controle-survente.sql` | Preuve de zéro survente, sur la base                                                       | P1    |
| `verifier-survente.sh`  | Lance le contrôle dans le conteneur PostgreSQL ; code de sortie ≠ 0 en cas de survente     | P1    |
| `lancer.sh`             | Le test puis le contrôle, en une commande                                                  | P1    |

## Interface entre les deux moitiés

`lib/file-attente.js` doit exporter, comme un contrat :

- `obtenirAdmission(evenementId)` → `{ jetonKeycloak, jetonAcces }` quand l'acheteur virtuel est
  admis (`null` sinon) : son jeton Keycloak (rôle `acheteur`) et le jeton d'accès remis par la File ;
- `jetonPourSetup()` → un jeton Keycloak d'acheteur, pour lire le plan de salle une fois au début ;
- `configurerVente(evenementId)` → ouvre la vente dans la File, au débit `DEBIT` (200 par défaut),
  dans `setup()` (provisoire, dette D-014).

## La preuve de zéro survente

Elle n'est pas dans k6, mais dans la base, après le test (`controle-survente.sql`) :

1. aucune place n'a plus d'un billet (requête de l'ADR 003) ;
2. pas plus de billets que de places en vente (requête de l'ADR 003) ;
3. tout billet correspond à une réservation payée ;
4. toute place vendue a son billet, émis pour la réservation qui l'a achetée.

Le script affiche aussi l'état final du stock (vendues, bloquées, libres) et les paiements à
rembourser. Si une règle est violée, il se termine en erreur : `lancer.sh` échoue même si les
seuils k6 sont respectés.
