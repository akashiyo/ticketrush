# tests/charge — Tests de charge k6

Partagé :

- **P2** : entrée dans la file, interrogation de la position, récupération du jeton.
- **P1** : réservation, paiement, et requêtes SQL de contrôle de survente.

Objectif : 50 000 acheteurs virtuels pour 5 000 places, zéro survente (scénario C-1, ADR 003). Une version réduite tourne en CI (ADR 021).

## Lancer

```
tests/charge/lancer.sh                     # k6 run mise-en-vente.js, puis le contrôle de survente
ACHETEURS=2000 tests/charge/lancer.sh      # version réduite
tests/charge/verifier-survente.sh          # le contrôle seul, sur la vente de démonstration
```

Le Compose doit tourner (`docker compose up -d`) : la vente de démonstration de 5 000 places
(`7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50`) est chargée par le Cœur au démarrage. Le test vise le Cœur
en direct (`BASE_COEUR=http://localhost:3002`) : la limite de débit de Traefik, comptée par adresse
IP, bloquerait un test lancé depuis une seule machine.

## Fichiers

| Fichier                 | Rôle                                                                                    | Piste |
| ----------------------- | --------------------------------------------------------------------------------------- | ----- |
| `mise-en-vente.js`      | Scénario : chaque acheteur entre dans la file, puis réserve et paie ; seuils P-2 et D-3 | P1+P2 |
| `lib/file-attente.js`   | Entrée dans la file et admission — **substitut** tant que P2 ne l'a pas écrit           | P2    |
| `lib/reservation.js`    | Blocage (3 essais si la place est prise), paiement (même `Idempotency-Key` sur un 503)  | P1    |
| `controle-survente.sql` | Preuve de zéro survente, sur la base                                                    | P1    |
| `verifier-survente.sh`  | Lance le contrôle dans le conteneur PostgreSQL ; code de sortie ≠ 0 en cas de survente  | P1    |
| `lancer.sh`             | Le test puis le contrôle, en une commande                                               | P1    |

## Interface entre les deux moitiés

`lib/file-attente.js` doit exporter, comme un contrat :

- `obtenirAdmission(evenementId)` → `{ jetonKeycloak, jetonAcces }` quand l'acheteur virtuel est
  admis (`null` sinon) : son jeton Keycloak (rôle `acheteur`) et le jeton d'accès remis par la File ;
- `jetonPourSetup()` → un jeton Keycloak d'acheteur, pour lire le plan de salle une fois au début.

## La preuve de zéro survente

Elle n'est pas dans k6, mais dans la base, après le test (`controle-survente.sql`) :

1. aucune place n'a plus d'un billet (requête de l'ADR 003) ;
2. pas plus de billets que de places en vente (requête de l'ADR 003) ;
3. tout billet correspond à une réservation payée ;
4. toute place vendue a son billet, émis pour la réservation qui l'a achetée.

Le script affiche aussi l'état final du stock (vendues, bloquées, libres) et les paiements à
rembourser. Si une règle est violée, il se termine en erreur : `lancer.sh` échoue même si les
seuils k6 sont respectés.
