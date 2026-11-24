# ADR 010 — Authentification et autorisation : Keycloak, hors du chemin critique au pic

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Deux populations se connectent à TicketRush :
- **les acheteurs**, qui arrivent par centaines de milliers au même instant ;
- **les organisateurs**, peu nombreux, qui gèrent leurs événements, tarifs et ventes dans leur dashboard. Ils ont des rôles différents et ne doivent jamais voir les données d'un autre organisateur (S-3).

Le sujet exige une protection contre les **accès en double** (E-1 : une seule position par acheteur). Il faut donc identifier l'acheteur, pas seulement son navigateur.

Le cours classe l'authentification comme un **sous-domaine générique** : on utilise une solution existante, on ne la construit pas. Il recommande OAuth 2.1 / OpenID Connect avec le flux « code d'autorisation + PKCE ».

Le risque principal : si chaque acheteur se connecte **au moment de l'ouverture**, le serveur d'identité reçoit tout le pic et devient le maillon qui casse (P-1).

## Décision

**Keycloak comme fournisseur d'identité**, en OpenID Connect avec le flux code d'autorisation + PKCE. Côté navigateur, on utilise la bibliothèque `oidc-client-ts`. L'application ne voit jamais le mot de passe.

**Les rôles**, portés dans le jeton :

| Rôle | Accès |
|---|---|
| `acheteur` | File d'attente, réservation, paiement, ses billets |
| `organisateur-admin` | Tout le dashboard de son organisation, gestion des membres |
| `organisateur-gestionnaire` | Ses événements et ses tarifs |
| `organisateur-lecteur` | Consultation des ventes |

Le jeton des organisateurs contient aussi l'identifiant de leur organisation. Le Cœur s'en sert pour activer l'isolation de PostgreSQL à chaque requête (ADR 016).

**Keycloak sort du chemin critique au moment du pic :**
1. L'acheteur doit être **connecté avant l'ouverture** de la vente. Les connexions sont ainsi étalées sur les minutes ou les heures qui précèdent.
2. À l'ouverture, les services **ne contactent plus Keycloak**. Ils vérifient la signature des jetons localement, avec les clés publiques de Keycloak (le fichier JWKS), récupérées une fois puis gardées en cache.
3. Le jeton d'accès dure 15 minutes. Son renouvellement est automatique et réparti dans le temps, donc il ne crée pas de pic.
4. Dans le test de charge, les 50 000 acheteurs virtuels utilisent des **jetons générés à l'avance**. Le test mesure la vente, pas la connexion. Keycloak est testé à part, avec une charge réaliste de connexions étalées.

**Zéro confiance entre services** : les appels du Cœur vers le faux prestataire de paiement sont authentifiés par un jeton de service (flux `client_credentials`). Aucun appel n'est accepté au seul motif qu'il vient du réseau interne.

## Alternatives écartées

- **Une authentification maison** (table d'utilisateurs, mots de passe hachés, jetons signés par nous). C'est réinventer un sous-domaine générique, avec un risque de faille élevé : stockage des mots de passe, réinitialisation, double authentification. Ça ne nous différencie en rien.
- **Un service d'identité hébergé (Auth0, Okta).** Il ne tourne pas dans notre Docker Compose (M-2). Il crée une dépendance à un fournisseur externe. Ses limites de débit et de prix dans l'offre gratuite ne sont pas adaptées à un test à 50 000 acheteurs.
- **Des sessions côté serveur**, avec un cookie et un état stocké. Chaque requête doit consulter le stockage des sessions : c'est un état partagé qui devient le goulot au pic et empêche les services d'être sans état.
- **Des acheteurs anonymes jusqu'au paiement.** On ne pourrait plus garantir une seule position par personne (E-1) : un même acheteur ouvrirait dix onglets ou dix navigateurs.

## Conséquences

- \+ Authentification standard et éprouvée, double authentification possible, sans code de sécurité maison à défendre.
- \+ Au pic, la vérification d'un jeton se fait en local, sans appel réseau : Keycloak ne limite pas le débit de la vente.
- \+ Les rôles et l'identifiant d'organisation dans le jeton servent directement à l'isolation entre organisateurs.
- − Un acheteur qui n'est pas connecté avant l'ouverture doit le faire au moment du pic. Les connexions tardives forment un petit pic sur Keycloak, qui doit être dimensionné en conséquence. C'est un risque à surveiller dans le tableau de bord.
- − Keycloak est un conteneur lourd (environ 500 Mo de RAM, démarrage lent), à intégrer au Docker Compose.
- − Un jeton volé reste valide jusqu'à son expiration (15 minutes), puisqu'on ne consulte pas Keycloak à chaque requête. C'est le compromis assumé entre la sécurité et la tenue de la charge.
