# Keycloak — domaine `ticketrush` (ADR 010)

Le fichier `realm-ticketrush.json` est importé par Keycloak **au premier démarrage** du Compose (`--import-realm`). S'il est modifié, il faut supprimer le domaine existant pour qu'il soit réimporté (par exemple `docker compose down -v`, qui efface aussi toutes les données).

- Console d'administration : http://localhost:8000/auth (via Traefik, ADR 013) (compte `admin` / `admin_dev`, valeurs de `.env.example`)
- Émetteur des jetons (`iss`) : `http://localhost:8000/auth/realms/ticketrush`, identique depuis la machine et depuis les autres conteneurs
- Clés publiques (JWKS) depuis un conteneur : `http://keycloak:8080/auth/realms/ticketrush/protocol/openid-connect/certs`

## Rôles

| Rôle                        | Accès                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `acheteur`                  | File d'attente, réservation, paiement, ses billets. Donné à **tout** compte, y compris à l'inscription |
| `organisateur-admin`        | Tout le dashboard de son organisation, gestion des membres                                             |
| `organisateur-gestionnaire` | Événements et tarifs de son organisation                                                               |
| `organisateur-lecteur`      | Consultation des ventes de son organisation                                                            |

Les rôles sont dans le jeton, dans `realm_access.roles`. Les organisateurs ont en plus le champ **`organisation_id`** (UUID), utilisé par la Row-Level Security du Cœur (ADR 016). Seul un administrateur Keycloak peut modifier l'organisation d'un utilisateur.

## Clients

| Client             | Type                                                   | Usage                                                                                                                                             |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ticketrush-web`   | Public, code d'autorisation + PKCE (S256)              | Application web. Connexion par mot de passe directe refusée (OAuth 2.1). Jeton d'accès de 15 min, audience `ticketrush-api`                       |
| `ticketrush-coeur` | Confidentiel, compte de service (`client_credentials`) | Appels du Cœur vers le faux prestataire de paiement. Secret de développement : `ticketrush-coeur-secret-dev`. Audience `ticketrush-faux-paiement` |

URL de retour autorisées pour `ticketrush-web` : `http://localhost:8000/*` (Traefik, adresse par défaut), `http://localhost:5173/*` (Vite, `pnpm dev`) et `http://localhost/*` (Traefik sur le port 80).

## Comptes de test

Mot de passe de tous les comptes : `ticketrush-dev` (valeur de développement uniquement).

| Identifiant                           | Rôles                               | Organisation (`organisation_id`)                         |
| ------------------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `acheteur1`, `acheteur2`, `acheteur3` | acheteur                            | —                                                        |
| `alpha.admin`                         | acheteur, organisateur-admin        | Alpha Productions `6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e01` |
| `alpha.gestion`                       | acheteur, organisateur-gestionnaire | Alpha Productions `6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e01` |
| `beta.admin`                          | acheteur, organisateur-admin        | Beta Live `6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e02`         |
| `beta.lecteur`                        | acheteur, organisateur-lecteur      | Beta Live `6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e02`         |

Deux organisations distinctes permettent de tester l'isolation entre organisateurs (scénario S-3).
