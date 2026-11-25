# TicketRush — Liste des ADR prévus

> Document de travail (binôme). Chaque ligne deviendra un fichier `docs/adr/NNNN-titre.md` au format MADR,
> avec le plan du cours : Contexte · Décision · Alternatives écartées · Conséquences (+ / −).
> Les identifiants de scénarios (C-1, P-1…) renvoient à la liste provisoire en bas de page, à finaliser dans l'arbre d'utilité.
>
> **Responsables** : P1 = domaine, cœur transactionnel, preuve de cohérence · P2 = entrée, infra, exploitation, gouvernance.
> **Priorité** : ★ = l'un des 5 thèmes imposés par le sujet (style, découpage, communication, cohérence du stock, sécurité) · ● = nécessaire au minimum de 12 · ○ = complémentaire.

## ADR

| N° | Titre | Décision | Scénarios | Alternatives écartées (raison) | Resp. | Prio |
|---|---|---|---|---|---|---|
| 001 | Style architectural | Monolithe modulaire « Cœur » + services séparés uniquement là où un scénario l'exige | P-1, D-2, M-1 | 6 microservices (coût du distribué pour 2 personnes, risque de monolithe distribué) · monolithe unique (la file et l'analytique ne peuvent ni scaler ni tomber séparément) | P1 | ★ |
| 002 | Découpage en contextes et unités déployables | 4 déployables : Cœur (Catalogue, Réservation, Organisateurs) · File d'attente · Analytique · Faux prestataire de paiement | P-1, D-1, D-2 | Découpage technique en couches (ne suit pas le domaine) · un service par contexte (trop d'unités, transactions distribuées entre Catalogue et Réservation) | P1 | ★ |
| 003 | Cohérence du stock de places | `UPDATE … WHERE statut = 'libre'` atomique + contrainte d'unicité (événement, place) sur les billets | C-1 | Compteur Redis `DECR` (deux sources de vérité) · `SELECT … FOR UPDATE` (verrous, débit plus faible) · verrou optimiste par version (rejeux en masse au pic) | P1 | ★ |
| 004 | Base de données principale | PostgreSQL, source de vérité unique, une base logique par unité déployable | C-1, S-3 | MongoDB (pas de contrainte d'unicité transactionnelle aussi simple) · MySQL (pas de RLS) · CockroachDB (sur-dimensionné, coût d'exploitation) | P1 | ● |
| 005 | Communication entre composants | REST + OpenAPI pour ce que l'utilisateur attend ; événements asynchrones entre contextes | P-2, D-2 | Tout synchrone (couplage temporel : l'analytique bloquerait la vente) · gRPC (peu utile depuis un navigateur, outillage plus lourd) | P1 | ★ |
| 006 | Broker d'événements | Redpanda (compatible Kafka, registre de schémas intégré) | D-2, M-1 | Kafka (plus lourd dans Compose) · RabbitMQ (pas d'historique rejouable) · Redis Streams (rétention et outillage plus limités) | P2 | ● |
| 007 | Publication fiable des événements | Outbox simple dans PostgreSQL + relais par polling ; consommateurs idempotents | D-2, C-1 | Double écriture base + broker (perte d'événement si crash entre les deux) · CDC Debezium (conteneur et configuration en plus) | P1 | ● |
| 008 | File d'attente virtuelle | Sorted set Redis + worker d'admission à débit fixé ; ordre d'arrivée | P-1, E-1 | Table PostgreSQL (charge sur la base qui protège le stock) · RabbitMQ (pas de position consultable) · SaaS type Queue-it (externe, payant) | P2 | ● |
| 009 | Statut de la file côté client | Polling avec intervalle imposé par le serveur ; SSE réservé au dashboard temps réel des organisateurs | P-1 | WebSocket ou SSE pour la file (des centaines de milliers de connexions ouvertes, difficile à tester avec k6) | P2 | ● |
| 010 | Authentification et autorisation | Keycloak (OIDC, code + PKCE, rôles) ; connexion avant l'ouverture, JWT vérifiés localement (JWKS) au pic | S-1, P-1 | Auth0 (dépendance externe) · authentification maison (sous-domaine générique, risque sécurité) · sessions serveur (état partagé, ne scale pas) | P2 | ★ |
| 011 | Jetons d'accès à la vente | JWT signés (`jose`), durée courte, `jti` à usage unique stocké dans Redis | S-2, P-2 | Session serveur (appel réseau à chaque vérification) · jeton opaque en base (charge sur PostgreSQL) | P2 | ★ |
| 012 | Protection contre les robots et les doublons | ALTCHA (preuve de travail auto-hébergée) + rate limiting Traefik + une seule position par compte | S-1, E-1 | reCAPTCHA / Turnstile (service tiers, données personnelles) · rate limiting seul (contourné par un robot distribué) | P2 | ● |
| 013 | Point d'entrée | Traefik (gateway, TLS, rate limiting, routage) ; un conteneur Nginx sert les fichiers de la SPA | P-1, S-1 | Nginx seul comme gateway (configuration statique) · Kong (plus lourd, base de données dédiée) · Envoy (configuration trop complexe) | P2 | ○ |
| 014 | Modèle de lecture du catalogue (CQRS) | Projection alimentée par les événements vers un moteur de recherche dédié, **Meilisearch** ; back-office organisateurs sur PostgreSQL | P-3 | PostgreSQL full-text (recherches au pic en concurrence avec la réservation) · Elasticsearch / OpenSearch (1 à 2 Go de RAM, sur-dimensionné pour le besoin) | P1 | ● |
| 015 | Stratégie de cache | Cache-aside Redis sur les fiches événement + invalidation par événements + cache HTTP des fichiers de la SPA | P-3 | Pas de cache (la base absorbe tout le pic) · TTL seul sans invalidation (données de vente périmées) | P1 | ● |
| 016 | Isolation multi-tenant des organisateurs | Row-Level Security PostgreSQL + rôles Keycloak + journal d'audit en base ; chaque organisateur a son dashboard de gestion (`/organisateur`) | S-3 | Base par organisateur (coût d'exploitation) · schéma par organisateur (migrations multipliées) · filtre applicatif seul (un bug = une fuite) | P1 | ● |
| 017 | Observabilité | OpenTelemetry + Collector → Prometheus, Tempo, Loki, Grafana (image `grafana/otel-lgtm` en local) | O-1 | Datadog (payant, dépendance fournisseur) · ELK (lourd, pas de traces natives) | P2 | ● |
| 018 | SLO et budgets d'erreur | SLO de la mise en vente calculés dans Prometheus, alertes par taux de consommation (burn rate) | P-1, P-2, P-3, P-4, D-3 | Alertes sur seuils bruts (bruyantes, sans lien avec l'expérience utilisateur) | P2 | ○ |
| 019 | Analytique en flux | Consumer KafkaJS avec fenêtres de temps, agrégats dans Redis, SSE vers le dashboard | D-2, P-4, O-1 | Flink / Kafka Streams (Java, hors compétences de l'équipe) · requêtes SQL périodiques (pas du temps réel, charge sur la base) | P2 | ○ |
| 020 | Langage et frameworks | TypeScript partout : React + Vite, NestJS, Drizzle | M-1 | Java/Spring (deux langages à maîtriser pour défendre tout le code) · Next.js (SSR inutile) · Prisma (SQL atomique trop abstrait) | P1 | ○ |
| 021 | Gouvernance et fonctions de fitness | GitHub Actions ; dependency-cruiser (dépendances), oasdiff (contrats), seuils k6 (performance) ; registre de dette | M-1, M-2 | ArchUnit (Java) · revue manuelle seule (les décisions divergent du code) | P2 | ● |
| 022 | Déploiement | Docker Compose lancé en une commande ; Kubernetes (k3d + HPA) en bonus | M-2 | Kubernetes d'emblée (complexité sans bénéfice au jalon 2) | P2 | ○ |

Total : 22 ADR prévus, dont 6 ★ et 11 ● = **17 prioritaires** (au-dessus du minimum de 12). Répartition : 10 pour P1, 12 pour P2 (P2 porte plus d'ADR courts : gateway, déploiement, SLO).

## ADR rédigés

Les 22 ADR sont rédigés. Statut « Accepté » pour les décisions déjà validées par le binôme (014, 016), « Proposé » pour les autres, à relire ensemble.

- [ADR 001 — Style architectural](0001-style-architectural.md)
- [ADR 002 — Découpage en contextes et unités déployables](0002-decoupage-contextes.md)
- [ADR 003 — Cohérence du stock de places](0003-coherence-du-stock.md)
- [ADR 004 — Base de données principale](0004-base-de-donnees.md)
- [ADR 005 — Communication](0005-communication.md)
- [ADR 006 — Broker d'événements](0006-broker-evenements.md)
- [ADR 007 — Publication fiable des événements (Outbox)](0007-outbox.md)
- [ADR 008 — File d'attente virtuelle](0008-file-attente.md)
- [ADR 009 — Suivi de la position dans la file](0009-statut-file-polling.md)
- [ADR 010 — Authentification et autorisation](0010-authentification.md)
- [ADR 011 — Jetons d'accès à la vente](0011-jetons-acces-vente.md)
- [ADR 012 — Protection contre les robots et les doublons](0012-anti-robots.md)
- [ADR 013 — Point d'entrée](0013-point-entree.md)
- [ADR 014 — Modèle de lecture du catalogue (Meilisearch)](0014-catalogue-cqrs-meilisearch.md)
- [ADR 015 — Stratégie de cache](0015-strategie-cache.md)
- [ADR 016 — Isolation multi-tenant des organisateurs](0016-isolation-multi-tenant.md)
- [ADR 017 — Observabilité](0017-observabilite.md)
- [ADR 018 — SLO et budgets d'erreur](0018-slo-budgets-erreur.md)
- [ADR 019 — Analytique en flux](0019-analytique-flux.md)
- [ADR 020 — Langage et frameworks](0020-langage-frameworks.md)
- [ADR 021 — Gouvernance et fonctions de fitness](0021-fonctions-fitness-ci.md)
- [ADR 022 — Déploiement](0022-deploiement.md)

## Scénarios de qualité provisoires (à finaliser dans l'arbre d'utilité)

| Id | Qualité | Scénario (source → stimulus → environnement → réponse → mesure) |
|---|---|---|
| C-1 | Cohérence | 50 000 acheteurs virtuels tentent d'acheter 5 000 places à l'ouverture → **0 place vendue deux fois, 0 billet au-delà du stock**, vérifié par requête SQL après le test |
| P-1 | Performance (entrée) | 50 000 acheteurs virtuels pour 5 000 places à l'ouverture → chaque acheteur reçoit sa position en **< 2 s au p99**, 0 erreur 5xx |
| P-2 | Performance (réservation) | Un acheteur admis réserve pendant le pic → blocage confirmé en **< 500 ms au p99** |
| P-3 | Performance (recherche) | Recherches pendant le test de charge (50 000 acheteurs virtuels) → recherche **< 300 ms au p99**, p99 de la réservation dégradé de **moins de 10 %** |
| E-1 | Équité | À l'ouverture → **100 %** des admissions respectent l'ordre de la file ; 0 compte avec deux positions |
| D-1 | Disponibilité (paiement) | Le prestataire de paiement tombe en pleine vente → la file continue, les places bloquées sont libérées à expiration (≤ 10 min), aucun billet émis sans paiement accepté |
| D-2 | Disponibilité (service arrêté) | Le comité arrête l'Analytique pendant la vente → 0 erreur côté achat ; au redémarrage, l'analytique rattrape les événements en **< 5 min** |
| D-3 | Disponibilité (parcours d'achat) | Pendant toute une vente, pannes comprises → **99,9 %** des requêtes du parcours d'achat sans erreur serveur (5xx) |
| P-4 | Performance (dashboard en direct) | Un billet est émis pendant le pic → la vente apparaît dans le dashboard de l'organisateur en **< 5 s** dans **95 %** des cas |
| S-1 | Sécurité (robots) | Un client automatisé sans preuve de travail valide → refusé à **100 %** à l'entrée de la file |
| S-2 | Sécurité (jetons) | Un jeton d'accès falsifié, expiré ou rejoué → refusé à **100 %** ; signature vérifiée en **< 5 ms** sans appel réseau, rejeu détecté par un seul appel Redis |
| S-3 | Sécurité (isolation) | L'organisateur A interroge les données de B → **0 ligne** renvoyée, vérifié par un test en CI |
| O-1 | Observabilité | Une réservation lente pendant le pic → sa trace complète est retrouvée dans Grafana en **< 1 min** |
| M-1 | Évolutivité | Ajout d'un nouveau consommateur d'événements → **0 modification** du producteur |
| M-2 | Maintenabilité (exploitation) | Un membre clone le dépôt → la plateforme complète démarre en **une commande, en < 5 min** |

## Périmètre retenu

Binôme avec la charge d'un trinôme : partie commune + 4 modules : Catalogue et recherche (N1), Organisateurs multi-tenants (N1), File d'attente virtuelle (N2), Analytique temps réel (N3).
