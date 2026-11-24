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

**L'intégration continue sur GitHub Actions**, à chaque pull request et sur la branche principale, dans cet ordre :
1. lint et vérification des types TypeScript ;
2. tests unitaires (Vitest) ;
3. tests d'intégration contre de vrais PostgreSQL, Redis et Redpanda (Testcontainers), y compris le test d'isolation multi-tenant (S-3, ADR 016) ;
4. les trois fonctions de fitness ci-dessous ;
5. un test de démarrage : `docker compose up`, puis vérification que chaque service répond (M-2).

Une pull request ne peut pas être fusionnée si une étape échoue.

**Les trois fonctions de fitness :**

| Fonction | Outil | Ce qui fait échouer la CI |
|---|---|---|
| **1. Règles de dépendances** | dependency-cruiser | Un module du Cœur importe l'intérieur d'un autre module au lieu de son dossier `api/` · le domaine importe NestJS, Drizzle ou un client réseau · un cycle de dépendances apparaît |
| **2. Compatibilité des contrats** | oasdiff pour les API OpenAPI, plus une comparaison des schémas AsyncAPI des événements | Une modification casse un client existant : champ supprimé ou renommé, champ obligatoire ajouté, type changé. Comparaison faite avec la version de la branche principale |
| **3. Seuil de performance** | Les seuils (`thresholds`) de k6 | Un test de charge réduit dépasse ses seuils : p99 de la réservation au-delà de 500 ms, taux d'erreur au-delà de 1 %, **ou au moins une survente détectée** |

**À propos de la fonction 3 :** le test complet, 50 000 acheteurs pour 5 000 places, demande plus de ressources qu'une machine d'intégration continue. La CI lance donc une **version réduite** à chaque pull request, par exemple 2 000 acheteurs pour 200 places, avec les mêmes seuils et la même vérification de survente. Le test complet est lancé avant chaque jalon. Son rapport est versionné dans `docs/rapports/`.

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
