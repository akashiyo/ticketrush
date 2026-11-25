# apps/web — Application web (React + Vite)

Partagé : la structure est posée par P2, puis chacun écrit ses pages dans son propre dossier (ADR 020).

- **Adresse : http://localhost:8000** (servie par Nginx derrière Traefik, dans le Compose)
- Développement avec rechargement à chaud : `pnpm --filter @ticketrush/web dev` puis http://localhost:5173. Les appels `/api` passent par Traefik : le Compose doit tourner.

## Pages

| Adresse                            | Page                                                                                                                                                                                   | Piste |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `/`                                | **Catalogue** : recherche par artiste, événement, salle ou ville, filtres ville et dates (Meilisearch)                                                                                 | P1    |
| `/evenements/{evenementId}`        | **Fiche** : salle, date, tarifs, accès à la vente                                                                                                                                      | P1    |
| `/acces`                           | Accès direct à une vente par son identifiant (développement, démonstration)                                                                                                            | P2    |
| `/connexion/retour`                | Retour de Keycloak après connexion                                                                                                                                                     | P2    |
| `/vente/{evenementId}`             | **Salle d'attente** : connexion obligatoire, entrée automatique avec preuve anti-robots, position et temps d'attente, passage à la réservation une fois admis                          | P2    |
| `/vente/{evenementId}/reservation` | **Réservation** : plan de salle (fosse ou siège numéroté), blocage avec le jeton d'accès, paiement avec compte à rebours et `Idempotency-Key`, billet ([`src/pages/p1`](src/pages/p1)) | P1    |

## Connexion (ADR 010)

Keycloak, flux **code d'autorisation + PKCE**, avec `oidc-client-ts` : l'application ne voit jamais le mot de passe. La session est gardée dans le `sessionStorage` de l'onglet et le jeton est renouvelé automatiquement. Comptes de test : [`infra/keycloak`](../../infra/keycloak/README.md).

## Salle d'attente (ADR 008, 009, 012)

1. Si l'acheteur n'est pas dans la file, la page demande un défi ALTCHA, le résout dans le navigateur (WebCrypto, sans bloquer la page) et entre dans la file. Une seule entrée, même si la page se recharge.
2. Elle interroge ensuite la position au rythme indiqué par le serveur (`prochainAppelDansSec`).
3. Dès que l'acheteur est admis, elle range le jeton d'accès et ouvre la page de réservation.

## Contrat avec la réservation de P1

Le passage est dans [`src/commun/passage-reservation.ts`](src/commun/passage-reservation.ts) :

- la salle d'attente range le jeton d'accès avec `rangerJetonAcces(evenementId, { jetonAcces, expireLe })` dans le `sessionStorage`, puis ouvre `/vente/{evenementId}/reservation` ;
- la page de réservation le lit avec `lireJetonAcces(evenementId)`, qui renvoie `null` s'il est absent ou expiré, et l'envoie au Cœur avec la réservation ;
- le Cœur vérifie le jeton avec la clé publique de la File : `http://file-attente:3000/.well-known/jwks.json` (ADR 011).

## Organisation

- `src/pages/p1/` et `src/pages/p2/` : les pages de chaque piste
- `src/auth/` : connexion Keycloak
- `src/commun/` : configuration, client de la File, preuve de travail, passage à la réservation
- `src/app/` : routes et gabarit

Configuration à la construction : `.env.example` (variables `VITE_*`). Tests : `pnpm --filter @ticketrush/web test`.
