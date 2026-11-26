# ADR 021 — Gouvernance : intégration continue, fonctions de fitness et registre de dette

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Le sujet impose :
- **une intégration continue**, au vert pour le rendu ;
- **au moins 3 fonctions de fitness automatisées** : règles de dépendances, compatibilité des contrats, seuil de performance ;
- **un registre de la dette technique**.

Plusieurs de nos décisions ne tiennent que si le code les respecte :
- les frontières entre modules du Cœur (ADR 001 et 002) ;
- les contrats d'API et d'événements (ADR 005) ;
- la tenue de la charge (P-1, P-2).

Le cours le résume : sans vérification automatique, l'architecture réelle s'éloigne silencieusement de l'architecture documentée. C'est le piège de l'architecte hors-sol.

Scénarios concernés :
- **M-1** : ajouter un consommateur d'événements ne modifie pas le producteur.
- **M-2** : la plateforme démarre en une commande.

## Décision

**L'intégration continue sur GitHub Actions** (`.github/workflows/ci.yml`), à chaque poussée et à chaque pull request, en deux jobs parallèles :
- **verifications** : formatage, lint et vérification des types TypeScript ; build ; fonctions de fitness 1 et 2 ; tests unitaires et d'intégration contre de vrais PostgreSQL, Redis et Redpanda (Testcontainers), y compris le test d'isolation multi-tenant (S-3, ADR 016) et la conformité des contrats OpenAPI au code ;
- **performance** : démarrage de la plateforme par Docker Compose, chaque service attendu sain (M-2), puis fonction de fitness 3.

On ne fusionne dans la branche principale qu'un commit dont la CI est verte.

**Les trois fonctions de fitness :**

| Fonction | Outil | Ce qui fait échouer la CI |
|---|---|---|
| **1. Règles de dépendances** | dependency-cruiser | Une des 9 règles ci-dessous est enfreinte |
| **2. Compatibilité des contrats** | oasdiff pour les API OpenAPI, plus une comparaison des schémas AsyncAPI des événements (`tests/fitness`) | Une modification casse un client existant : champ supprimé ou renommé, champ obligatoire ajouté, type changé. Comparaison faite avec la version de la branche principale |
| **3. Seuil de performance** | Les seuils (`thresholds`) de k6, puis le contrôle SQL de survente | Un test de charge réduit dépasse ses seuils : entrée et position au-delà de 2 s au p99 (P-1), blocage au-delà de 500 ms au p99 (P-2), une erreur serveur sur le parcours (D-3), aucun acheteur admis, **ou au moins une survente détectée** (C-1) |

**Les règles de la fonction 1** (fichier `.dependency-cruiser.cjs`, commande `pnpm fitness:dependances`) :

| Règle | Interdit | Décision protégée |
|---|---|---|
| `pas-de-cycle` | Un cycle de dépendances entre fichiers | Modules séparables (ADR 002) |
| `domaine-sans-couches-externes` | Le domaine importe `application/` ou `infrastructure/` | Hexagonal (ADR 001, 020) |
| `domaine-sans-technique` | Le domaine importe NestJS, Drizzle, Kysely, un client PostgreSQL, Redis, Kafka ou Meilisearch, Express, OpenTelemetry (ou notre paquet `@ticketrush/observabilite`), pino, ALTCHA, ou un module réseau de Node (`http`, `net`…) | Hexagonal (ADR 001, 020) |
| `application-sans-infrastructure` | La couche application importe un adaptateur d'infrastructure au lieu d'un port du domaine (tests exceptés) | Hexagonal (ADR 001, 020) |
| `coeur-modules-par-api` | Un module du Cœur (`catalogue`, `reservation`, `organisateurs`) importe l'intérieur d'un autre module au lieu de son dossier `api/` | Monolithe modulaire (ADR 001, 002) |
| `services-isoles` | Une unité déployable importe le code d'une autre | Unités indépendantes, contrats seuls partagés (ADR 002, 005) |
| `front-sans-code-serveur` | L'application web importe le code d'un service | Communication par HTTP (ADR 005) |
| `contrats-autonomes` | `packages/contrats` importe une application ou un service | Contrats comme base commune (ADR 005) |
| `pas-d-import-introuvable` | Un import qui ne se résout pas | Aucune dépendance cachée ou non déclarée |

**La fonction 2** (commande `pnpm fitness:contrats`) compare chaque contrat de `packages/contrats` à sa version sur la branche principale (sur la branche principale elle-même : au commit précédent). Un contrat nouveau est une première version, sans comparaison. Les contrats OpenAPI des services de P2 (faux prestataire de paiement, File d'attente) sont accompagnés d'un test qui vérifie qu'ils décrivent exactement les routes du code : un contrat qui ment rendrait la comparaison inutile.

**À propos de la fonction 3 :** le test complet, 50 000 acheteurs pour 5 000 places, demande plus de ressources qu'une machine d'intégration continue. La CI lance donc une **version réduite** à chaque poussée : **2 000 acheteurs arrivant en une minute** (débit constant, comme P-1), sur la vente de démonstration de 5 000 places, avec les mêmes seuils et la même vérification de survente. Le test complet est lancé avant chaque jalon. Son rapport est versionné dans `docs/rapports/`.

Conditions du test réduit, inscrites au registre de dette : vente de 5 000 places et non 200 (D-007), jetons pré-générés par une identité de test au lieu de Keycloak (D-023, cohérent avec l'ADR 010 : Keycloak n'est pas appelé au pic), accès direct à la File et au Cœur sans Traefik (D-024), défis ALTCHA désactivés (D-010).

**Le registre de dette** est un fichier `docs/dette-technique.md`. Chaque entrée contient :
- la description de la dette ;
- son type selon le quadrant de Fowler (prudente ou imprudente, délibérée ou involontaire) ;
- l'ADR concerné ;
- le coût estimé si on ne la rembourse pas ;
- la date prévue de remboursement.

Toute dette délibérée, comme « Redis sans haute disponibilité » (ADR 008), y est inscrite dès sa décision.

## Alternatives écartées

- **ArchUnit**, l'outil montré en cours. Il ne fonctionne que pour Java : dependency-cruiser joue le même rôle pour TypeScript.
- **Une revue de code seule, sans règle automatique.** Elle dépend de l'attention de chacun, et une violation passe facilement dans une grosse pull request. Les règles automatiques ne se fatiguent pas.
- **Pact pour la compatibilité des contrats.** Il est plus complet, puisque chaque consommateur décrit ce qu'il attend, mais plus lourd à mettre en place. oasdiff couvre l'exigence du sujet ; Pact est prévu en bonus.
- **Le test de charge complet dans la CI.** Il dépasse les ressources d'une machine GitHub Actions et durerait trop longtemps pour chaque pull request.

## Conséquences

- \+ Les décisions des ADR 001, 002 et 005 sont **vérifiées à chaque modification** : elles ne peuvent pas être contournées sans que la CI le signale.
- \+ La preuve de zéro survente est rejouée à chaque pull request, à petite échelle.
- \+ La dette est visible et rattachée aux décisions, comme le demande le cours.
- − La CI devient plus longue, de l'ordre de 10 minutes avec les conteneurs de test et le test réduit.
- − Le test de charge réduit ne prouve pas la tenue à 50 000 acheteurs. Il détecte les régressions ; la preuve complète reste le test lancé avant chaque jalon.
- − Une règle de dépendances trop stricte peut bloquer un changement légitime. La modifier doit alors passer par un nouvel ADR, pas par une exception silencieuse.
