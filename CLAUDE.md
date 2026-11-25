# CLAUDE.md — TicketRush

Projet ESGI M1 Architecte logiciel (cours « Architecture logicielle », RootIT Lab).
Source de vérité : le sujet `Projet_TicketRush.pdf`, recopié intégralement ci-dessous (§1).
**Ce fichier est la règle : tout code, config ou doc produit dans ce dépôt doit s'y conformer.**

---

## 0. Procédure obligatoire AVANT chaque modification

Avant d'écrire du code, une config ou un document, vérifier et dire en une ligne :

1. **Exigence du sujet** : à quelle consigne précise du §1 cela répond-il (partie commune, module retenu, rendu, jalon, bonus) ?
   Si aucune → **ne pas le faire**, le signaler comme hors sujet. Les bonus restent permis, mais seulement en option.
2. **Scénario de qualité** : quel scénario de `docs/arc42/10-exigences-qualite.md` cela sert-il (ex. C-1, P-2, D-1) ?
   Le sujet l'impose : *chaque choix doit être justifié par un scénario de qualité*.
3. **ADR** : la décision est-elle couverte par un ADR de `docs/adr/` (index `docs/adr/liste-adr.md`) ?
   Nouvelle techno, nouveau pattern ou changement de décision → **ADR d'abord**, code ensuite.
4. **Stack** : uniquement les technos du §3. Aucune autre sans ADR.
5. **Périmètre** : uniquement les 4 modules retenus (§2). Ne jamais réduire ni élargir ce périmètre.
6. **Propriété** : le fichier appartient-il à la piste de la personne qui travaille (P1 / P2, §2) ? Sinon, passer par les contrats de `packages/contrats`.
7. **Invariants** (§4) : zéro survente, lancement en une commande, CI au vert, frontières de modules, observabilité.

Après la modification : lint, typecheck, tests et fitness doivent passer ; mettre à jour la doc (arc42, C4, ADR, dette) si la modification la rend fausse.

---

## 1. Le sujet (recopié intégralement)

### Principe
TicketRush est une plateforme de billetterie pour concerts et événements sportifs. Lors des mises en vente les plus attendues, plusieurs centaines de milliers de personnes se connectent au même instant pour quelques milliers de places. Il faut concevoir, documenter, justifier et réaliser l'architecture : elle doit **absorber le pic**, rester **équitable** entre les acheteurs, **résister aux pannes** et **ne jamais vendre deux fois la même place**.
Le projet est évalué autant sur la qualité des décisions et de leur justification que sur l'implémentation.

### Partie commune (obligatoire)
- **Exigences de qualité** : parties prenantes, arbre d'utilité et **au moins 8 scénarios de qualité mesurables**, dont ceux de la mise en vente (charge, cohérence, disponibilité, sécurité).
- **Domaine** : Event Storming du parcours d'achat, sous-domaines classés (cœur, support, générique), contextes délimités et carte de contexte.
- **Dossier d'architecture au format arc42** : diagrammes C4 de contexte, de conteneurs et de composants (pour au moins un conteneur) **écrits sous forme de code**, vue de déploiement, scénarios d'exécution clés.
- **Décisions** : **au moins 12 ADR** (contexte, décision, alternatives écartées, conséquences), dont obligatoirement : le style architectural, le découpage, la communication, la cohérence du stock et la sécurité.
- **Squelette fonctionnel** : une mise en vente de bout en bout (catalogue, réservation d'une place, paiement simulé, émission du billet), conteneurisée et **lancée en une commande**.
- **Preuve de cohérence** : un test de charge (k6, Gatling ou Locust) simulant **au moins 50 000 acheteurs virtuels sur 5 000 places**, qui démontre l'**absence totale de survente**.
- **Exploitation** : traces distribuées, métriques et journaux (OpenTelemetry), tableau de bord de la mise en vente, SLO définis et mesurés.
- **Gouvernance** : intégration continue, **au moins 3 fonctions de fitness automatisées** (règles de dépendances, compatibilité des contrats, seuil de performance), registre de la dette technique.

### Les modules
**Niveau 1**
- **Catalogue et recherche** : événements, salles et plans de salle, recherche par date, lieu et artiste ; modèle de lecture séparé (CQRS) et stratégie de cache justifiée.
- **Organisateurs multi-tenants** : chaque organisateur gère ses événements, ses tarifs et ses ventes ; isolation stricte des données entre organisateurs, rôles et journal d'audit.

**Niveau 2**
- **File d'attente virtuelle** : entrée contrôlée dans la vente, position et temps d'attente affichés, jetons d'accès signés et limités dans le temps, protection contre les robots et les accès en double.
- **Réservation et paiement** : blocage temporaire des places avec expiration, saga de paiement avec compensations, pattern Outbox, idempotence de bout en bout, prestataire de paiement simulé et instable.

**Niveau 3**
- **Revente et billets infalsifiables** : historique complet de chaque billet par event sourcing, revente encadrée entre particuliers (prix plafonné), QR code signé, contrôle d'accès capable de fonctionner hors ligne à l'entrée de la salle.
- **Analytique temps réel et fiabilité** : traitement de flux des événements de vente, tableau de bord temps réel pour les organisateurs, budgets d'erreur, alertes sur les SLO et post-mortem d'un incident simulé.

### Exigence minimale
- Trinôme : partie commune + 4 modules, dont au moins 1 de niveau 3.
- Quadrinôme : partie commune + 5 modules, dont les deux de niveau 3.
- **Rendu** : le dépôt Git (code, ADR, diagrammes en code, **CI au vert**), le dossier arc42, les rapports des tests de charge et de résilience, et une vidéo de la mise en vente sous charge.

### Jalons
1. **Jalon 1** : exigences de qualité, Event Storming, carte de contexte, diagramme de contexte et premiers ADR.
2. **Jalon 2** : diagramme de conteneurs, ADR structurants, squelette fonctionnel déployé et observable.
3. **Jalon 3** : premier test de charge et revue d'architecture intermédiaire (ATAM allégée) avec l'enseignant.
4. **Rendu final** : modules, preuves de qualité, dossier complet, puis soutenance.

### Bonus (points supplémentaires, optionnels)
- Déploiement sur Kubernetes réparti sur plusieurs zones, avec mise à l'échelle automatique.
- Chaos engineering automatisé pendant le test de charge (arrêt de services, latence réseau injectée).
- Tests de contrat entre services (Pact) et registre de schémas pour les événements.
- Architecture multi-région active-passive avec objectifs de reprise (RTO et RPO) démontrés.

### Barème (/20)
| Critère | Points |
|---|---|
| Dossier d'architecture (qualités, domaine, C4, ADR, compromis) | 5 |
| Implémentation (squelette et modules) | 6 |
| Qualités démontrées (charge, cohérence, résilience, sécurité) | 3 |
| Gouvernance et évolution (fitness, CI, dette) | 3 |
| Soutenance | 3 |

### Soutenance
Devant un comité d'architecture : défense des scénarios et des ADR, puis **démonstration d'une mise en vente sous charge pendant laquelle le comité injecte une panne** (service arrêté, prestataire de paiement indisponible). Le comité soumet ensuite une exigence nouvelle : **20 minutes pour rédiger l'ADR** et présenter son impact.
**Chaque membre doit pouvoir défendre l'ensemble des décisions et expliquer tout le code rendu.** Tous les langages, frameworks et services sont autorisés, **à condition que chaque choix soit justifié par un scénario de qualité**.

---

## 2. Périmètre et équipe (décisions de l'équipe)

- Équipe : **binôme**, qui assume volontairement la charge d'un **trinôme** → partie commune + **4 modules** :
  - Catalogue et recherche (N1)
  - Organisateurs multi-tenants (N1) — section `/organisateur` de la SPA ; s'en tenir au sujet (événements, tarifs, ventes, isolation, rôles, audit)
  - File d'attente virtuelle (N2)
  - Analytique temps réel et fiabilité (N3)
- **Réservation et paiement (N2) n'est PAS un module retenu** : la réservation et le paiement simulé existent seulement au niveau du squelette (pas de saga de paiement avec compensations exigée). Une Outbox simple (relais par polling) sert à publier les événements de vente vers l'Analytique et la projection catalogue (ADR 007).
- Revente et billets infalsifiables (N3) : non retenu.
- Rôles :
  - **P1** — domaine, cœur transactionnel, preuve de cohérence : `services/coeur/` (Catalogue, Réservation, Organisateurs), pages catalogue / réservation / back-office organisateurs, test de charge k6.
  - **P2** — entrée, infra, exploitation, gouvernance : `services/file-attente/`, Analytique, `services/faux-paiement/`, `infra/`, CI et fitness, structure du monorepo, pages salle d'attente / connexion / dashboard temps réel.
- Les deux pistes ne communiquent que par les **contrats de `packages/contrats`** (jeton d'admission, événements AsyncAPI, stock restant, API du faux paiement, jetons Keycloak). En attendant l'autre piste, utiliser un substitut conforme au contrat.

---

## 3. Stack imposée (voir ADR 020 et suivants)

TypeScript partout (chacun doit pouvoir lire et défendre tout le code).

- **Front** : React + Vite (SPA servie par Nginx derrière Traefik), React Router, TanStack Query, oidc-client-ts, Recharts. SSE **uniquement** pour le dashboard temps réel organisateurs ; la file d'attente utilise du **polling** à intervalle fixé par le serveur.
- **Back** : NestJS ; Drizzle ORM (ou Kysely) pour contrôler le SQL de réservation.
- **Unités déployables (4)** : Cœur (monolithe modulaire : Catalogue + Réservation + Organisateurs, frontières vérifiées par dependency-cruiser) · File d'attente · Analytique · Faux prestataire de paiement (instable, pour la démo de panne).
- **Données** : PostgreSQL = source de vérité ; Row-Level Security pour l'isolation multi-tenant ; Redis (file en sorted set, cache catalogue, anti-rejeu `jti`, rate limiting) ; **Meilisearch** pour la recherche publique alimentée par projection CQRS (le back-office organisateurs reste sur PostgreSQL + RLS).
- **Communication** : REST + OpenAPI (synchrone) ; Redpanda (Kafka) + Outbox (asynchrone) ; schémas d'événements en AsyncAPI.
- **Sécurité** : Keycloak (OIDC, hors du chemin critique : connexion avant l'ouverture, JWT vérifiés localement via JWKS) ; jetons d'admission JWT signés avec `jose`, durée courte, `jti` à usage unique dans Redis ; anti-robots **ALTCHA** + rate limiting Traefik.
- **Observabilité** : OpenTelemetry SDK + Collector ; `grafana/otel-lgtm` en local (Prometheus, Tempo, Loki, Grafana) ; dashboards versionnés dans le dépôt ; logs JSON avec trace id.
- **Tests et gouvernance** : Vitest + Testcontainers ; k6 (`constant-arrival-rate`, thresholds = fitness performance) ; dependency-cruiser (fitness dépendances) ; oasdiff (fitness compatibilité de contrats) ; GitHub Actions ; Toxiproxy (bonus chaos).
- **Infra et doc** : Docker + Docker Compose (une commande) ; monorepo pnpm 10 / Node 24 / TypeScript ~6.0 ; Structurizr DSL (`docs/architecture/workspace.dsl`) ; arc42 en Markdown (`docs/arc42/`).

Toute techno hors de cette liste = **nouvel ADR obligatoire** avant de l'introduire.

---

## 4. Invariants à ne jamais casser

1. **Zéro survente** : blocage par `UPDATE … WHERE statut = 'libre'` atomique **et** contrainte d'unicité (événement, place) sur les billets (ADR 003). Ne jamais contourner, ne jamais vérifier le stock seulement côté application ou cache.
2. **Lancement en une commande** : `docker compose up` doit démarrer toute la mise en vente de bout en bout. Tout nouveau service est ajouté au compose.
3. **CI au vert** : lint, typecheck, tests et les 3 fitness passent avant tout push.
4. **Frontières** : le domaine ne dépend pas de l'infra (hexagonal) ; un module du Cœur n'importe que l'`api` publique d'un autre module ; entre services, uniquement via contrats (`packages/contrats`).
5. **Isolation multi-tenant** : toute requête organisateur passe par la RLS ; jamais de données d'un organisateur visibles par un autre.
6. **Résilience** : délais (timeouts) sur tout appel réseau, retries avec backoff + jitter seulement sur opérations idempotentes, disjoncteur vers le faux paiement ; une place bloquée expire et se libère si le paiement échoue.
7. **Observabilité** : tout nouveau service exporte traces, métriques (RED) et logs via OpenTelemetry.
8. **Équité** : l'ordre d'entrée dans la vente est décidé par la file d'attente, jamais contournable par un accès direct au Cœur sans jeton d'admission valide.

---

## 5. Formats attendus par le cours

- **ADR** : un fichier par décision dans `docs/adr/NNNN-titre.md`, immuable une fois accepté (on le remplace par un nouvel ADR) :
  ```
  # ADR NNN — Titre
  Statut : Proposé|Accepté (AAAA-MM-JJ) · Responsable : P1|P2 [· remplace l'ADR X]
  ## Contexte        (cite le ou les scénarios de qualité, ex. C-1, P-2)
  ## Décision
  ## Alternatives écartées
  ## Conséquences    (lignes + et −)
  ```
  Mettre à jour `docs/adr/liste-adr.md` à chaque ajout.
- **Scénario de qualité** en 6 parties : Source → Stimulus → Artefact → Environnement → Réponse → Mesure (chiffrée).
- **C4** en Structurizr DSL : contexte sans techno ; conteneurs avec techno + protocole sur chaque relation ; légende sur chaque vue.
- **arc42** : §1-3 objectifs / contraintes / contexte, §4-8 stratégie, blocs, exécution, déploiement, concepts transverses, §9 ADR, §10 qualité, §11 risques et dette (`docs/dette-technique.md`), §12 glossaire.
- **SLO** : définis à partir de SLI mesurés dans Prometheus, avec budget d'erreur ; post-mortems dans `docs/postmortems/`.
- Vocabulaire du domaine en **français** (langage omniprésent : `Evenement`, `Siege`, `Billet`, `Reservation`, `JetonAdmission`…).

---

## 6. Commandes

```
pnpm install
pnpm lint        # ESLint
pnpm typecheck
pnpm test        # Vitest
pnpm format:check
docker compose up
```
