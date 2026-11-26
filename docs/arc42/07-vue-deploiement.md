# 7. Vue de déploiement

> Rédigée par P2 (ADR 022). Deux environnements, décrits **en code** dans
> [`../architecture/workspace.dsl`](../architecture/workspace.dsl) :
>
> - **Local** (vue `Deploiement-Local`) : ce qui est réellement livré et démontré, lancé par
>   `docker compose up` ;
> - **Production** (vue `Deploiement-Production`) : la cible documentée, sur Kubernetes et trois zones
>   de disponibilité. Elle n'est démontrée que si le bonus Kubernetes est réalisé.
>
> Les deux vues réutilisent les conteneurs du modèle C4 : un conteneur est décrit une fois, puis
> placé sur les nœuds de chaque environnement.

Afficher les vues : voir la section 3.3 ([03-contexte.md](03-contexte.md)), puis choisir
`Deploiement-Local` ou `Deploiement-Production`.

## 7.1 Environnement local : Docker Compose

### Motivation

Le sujet exige un squelette **conteneurisé et lancé en une commande** (scénario **M-2** : une
commande, tous les conteneurs `healthy` en moins de 5 minutes). Le comité doit pouvoir relancer la
plateforme lui-même et y injecter des pannes en pleine vente (**D-1**, **D-2**). Docker Compose
répond à ces trois besoins sur une seule machine, sans compte ni service payant (ADR 022).

### Infrastructure

```
docker compose up -d     # démarre tout, dans l'ordre des contrôles de santé
docker compose ps        # tous « healthy » ; keycloak-db-init et lecture-grafana-init « Exited (0) »
docker compose down      # arrêt ; « -v » efface aussi les données
```

Une machine, un réseau Docker (`ticketrush_default`) : les conteneurs se joignent par leur nom de
service (`postgres`, `redis`, `keycloak`…). Les navigateurs ne passent que par **Traefik** sur
`http://localhost:8000` (ADR 013). Les autres ports ne sont ouverts que sur `127.0.0.1`, pour le
développement et le diagnostic.

| Nœud (service Compose) | Conteneur du modèle C4      | Image                               | Limites (CPU · mémoire) | Port sur la machine      | Données persistées       |
| ---------------------- | --------------------------- | ----------------------------------- | ----------------------- | ------------------------ | ------------------------ |
| `traefik`              | Point d'entrée              | `traefik:v3.6`                      | 1 · 256 Mo              | **8000** (seule entrée)  | —                        |
| `web`                  | Application web             | construite (`nginx:alpine`)         | 0,5 · 64 Mo             | — (via Traefik `/`)      | —                        |
| `keycloak`             | Fournisseur d'identité      | `quay.io/keycloak/keycloak:26.4`    | 2 · 1,5 Go              | — (via Traefik `/auth`)  | dans PostgreSQL          |
| `keycloak-db-init`     | — (tâche ponctuelle)        | `postgres:18-alpine`                | —                       | —                        | crée la base `keycloak`  |
| `file-attente`         | File d'attente              | construite (`node:24-alpine`)       | 1 · 384 Mo              | 3001 (direct, dév.)      | — (état dans Redis)      |
| `coeur`                | Cœur                        | construite (`node:24-alpine`)       | 2 · 512 Mo              | 3002 (direct, dév.)      | — (état dans PostgreSQL) |
| `faux-paiement`        | Prestataire de paiement (simulé) | construite (`node:24-alpine`)  | 0,5 · 256 Mo            | 3003                     | — (en mémoire, dette D-013) |
| `postgres`             | Base de données             | `postgres:18-alpine`                | 2 · 1 Go                | 5432                     | volume `postgres-data`   |
| `redis`                | Redis                       | `redis:8-alpine`                    | 1 · 512 Mo              | 6379                     | volume `redis-data` (AOF) |
| `redpanda`             | Broker d'événements         | `redpanda:v25.2.10`                 | 1 · 1,5 Go              | 19092, 18081, 9644       | volume `redpanda-data`   |
| `meilisearch`          | Moteur de recherche         | `getmeili/meilisearch:v1.15`        | 1 · 512 Mo              | 7700                     | volume `meilisearch-data` |
| `observabilite`        | Collecteur + Observabilité  | `grafana/otel-lgtm:0.41.1`          | 2 · 2 Go                | **3000** (Grafana), 4317, 4318 | — (dette D-008)    |
| `lecture-grafana-init` | — (tâche ponctuelle)        | `postgres:18-alpine`                | —                       | —                        | rôle PostgreSQL en lecture seule de Grafana |
| _à venir_ `analytique` | Analytique                  | construite                          | —                       | —                        | — (agrégats dans Redis)  |

**Total des limites** : 14 CPU et environ 8,4 Go de mémoire au maximum. Ce sont des plafonds, pas une
réservation : ils rendent les mesures du test de charge reproductibles et laissent des ressources à
k6 (ADR 022). Le test de charge se lance de préférence depuis une autre machine.

### Ordre de démarrage

Chaque service a un **contrôle de santé**, et ne démarre qu'une fois ses dépendances saines
(`depends_on` avec `condition: service_healthy`) :

1. `postgres`, `redis`, `redpanda`, `meilisearch`, `observabilite` ;
2. `keycloak-db-init` (crée la base de Keycloak, puis s'arrête), puis `keycloak` ;
3. `file-attente` (après Redis) et `coeur` (après PostgreSQL, Redis, Redpanda et Meilisearch ;
   il applique ses migrations et charge la vente de démonstration de 5 000 places) ;
4. `faux-paiement`, `web` et `traefik`, sans dépendance ;
5. `lecture-grafana-init` (après le Cœur, dont les migrations créent les tables lues) : rôle en
   lecture seule pour le contrôle continu de la survente dans Grafana (`docs/exploitation/slo.md`).

Traefik charge aussi `infra/traefik/secours.yml` : quand un service est arrêté, ses routes
répondent 503 au lieu d'être capturées par une route plus générale (ADR 013).

Aucun service ne dépend de `observabilite` : s'il est arrêté, la vente continue et la télémétrie est
abandonnée (ADR 017, vérifié le 25/11/2026 : 10 requêtes sur 10 servies, observabilité arrêtée).

**Mesure de M-2** : démarrage à froid (volumes vides, images construites) en **2 min 03 s** le
25/11/2026 pour 11 conteneurs, avant l'ajout de l'observabilité. À chronométrer de nouveau sur une
machine propre avant chaque jalon.

### Pannes injectables pendant la démonstration

| Scénario | Commande                          | Comportement attendu                                                    |
| -------- | --------------------------------- | ----------------------------------------------------------------------- |
| **D-1**  | `docker compose stop faux-paiement` | Le disjoncteur du Cœur s'ouvre ; la file et la réservation continuent |
| **D-2**  | `docker compose stop analytique` (une fois le service livré) | La vente continue ; l'Analytique rattrape les événements au redémarrage |
| **O-1**  | —                                 | La trace d'une requête lente se retrouve dans Grafana (Tempo)           |

Les services sans état (`file-attente`, `coeur`) peuvent être lancés en plusieurs instances derrière
Traefik : `docker compose up -d --scale file-attente=3`. Les secrets de la File doivent alors être
fournis (dette D-015).

## 7.2 Cible de production : Kubernetes sur trois zones

### Motivation

Docker Compose tourne sur **une seule machine** : il démontre la tolérance à l'arrêt d'un conteneur,
pas à la perte d'une machine ou d'une zone (dette D-009). La cible de production répond aux mêmes
scénarios à l'échelle réelle :

- **P-1** (entrée dans la file à l'ouverture) : la File d'attente se met à l'échelle seule, sans
  multiplier les instances du Cœur (ADR 001) ;
- **D-3** (parcours d'achat disponible sur toute la vente) : les services sans état tournent dans
  les trois zones, les données sont répliquées entre zones ;
- **C-1** (zéro survente) : PostgreSQL reste l'unique source de vérité du stock, avec une seule
  instance primaire qui accepte les écritures (ADR 003).

### Infrastructure

Une région d'un fournisseur cloud, trois zones de disponibilité. Un équilibreur de charge termine
le TLS et répartit le trafic entre les zones ; un CDN (évolution, ADR 015) sert les fichiers de
l'application au plus près des acheteurs.

| Charge                  | Objet Kubernetes          | Instances                     | Répartition                       | Justification                                    | Statut     |
| ----------------------- | ------------------------- | ----------------------------- | --------------------------------- | ------------------------------------------------ | ---------- |
| Point d'entrée (Traefik) | Deployment (Ingress)     | 3                             | une par zone                      | ADR 013 ; limitation de débit par instance (D-006) | Proposé    |
| Application web (Nginx) | Deployment                | 3                             | une par zone                      | Fichiers statiques, derrière le CDN              | Proposé    |
| Fournisseur d'identité  | Deployment                | 2                             | deux zones                        | Hors du chemin critique au pic (ADR 010)         | Proposé    |
| **File d'attente**      | Deployment + **HPA**      | 3 minimum, maximum au test de charge | réparties sur les zones    | Encaisse le pic (P-1) ; sans état (ADR 009, 022)  | Décidé (ADR 022) |
| Cœur                    | Deployment                | 3, à ajuster au test de charge | une par zone                     | Sans état ; pool de connexions borné (ADR 004)   | Proposé    |
| Analytique              | Deployment                | 1                             | une zone                          | Une seule instance (ADR 019, dette D-005)        | Décidé     |
| Collecteur OpenTelemetry | DaemonSet                | un par nœud du cluster        | toutes les zones                  | Télémétrie au plus près des services (ADR 017)   | Proposé    |
| PostgreSQL              | StatefulSet               | 2 : primaire + réplique       | deux zones, bascule automatique   | ADR 022, dette D-003                             | Décidé     |
| Redis                   | StatefulSet + Sentinel    | 3 : primaire + 2 répliques    | une par zone                      | La file ne doit pas être perdue (dette D-001)    | Décidé     |
| Redpanda                | StatefulSet               | 3 brokers, réplication 3      | un par zone                       | Aucun événement perdu (D-2, dette D-004)         | Décidé     |
| Meilisearch             | StatefulSet               | 1                             | une zone                          | Reconstruisible depuis les événements            | Point ouvert |
| Observabilité           | StatefulSets séparés      | Prometheus, Tempo, Loki, Grafana | —                              | Dimensionnés séparément (ADR 017, dette D-008)   | Décidé     |

« Décidé » : écrit dans un ADR ou dans le registre de dette. « Proposé » : choix raisonnable de cette
vue, à valider ensemble. « Point ouvert » : à trancher, voir 7.4.

Le prestataire de paiement reste un **service externe**, appelé en HTTPS avec une clé d'idempotence
(ADR 005).

## 7.3 Ce qui change entre local et production

| Aspect                   | Local (livré)                                      | Production (cible)                                   |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------- |
| Machines                 | Une seule                                          | Nœuds Kubernetes sur trois zones                     |
| TLS                      | Aucun : HTTP sur `localhost` (voir 7.4)            | Terminé par l'équilibreur de charge                  |
| Données                  | Une instance de chaque stockage, volumes Docker    | Répliquées entre zones (PostgreSQL, Redis, Redpanda) |
| Mise à l'échelle         | Manuelle : `docker compose up --scale`             | Automatique pour la File d'attente (HPA)             |
| Observabilité            | Image tout-en-un `grafana/otel-lgtm`               | Prometheus, Tempo, Loki et Grafana séparés           |
| Secrets                  | Valeurs de développement par défaut, `.env` local | Gestionnaire de secrets, à décider (cours : moindre privilège) |
| Échantillonnage des traces | 100 %                                            | 10 % des traces normales au pic (ADR 017)            |

Le code et les images sont **les mêmes** dans les deux environnements : seule la configuration
(variables d'environnement) change. C'est ce qui rend les mesures locales utiles pour la cible.

## 7.4 Points ouverts

- **TLS en local** : l'ADR 013 prévoit un certificat de développement dans Traefik ; il n'est pas en
  place. À faire, ou à retirer de l'ADR (un certificat auto-signé provoque une alerte du navigateur
  pendant la démonstration et oblige k6 à ignorer la vérification).
- **Meilisearch en production** : aucune décision sur sa haute disponibilité. Une instance
  reconstruisible depuis les événements suffit-elle, vu la rétention de 7 jours de Redpanda
  (ADR 006) ?
- **Nombre d'instances** de Traefik, de Keycloak et du Cœur, et **maximum de l'HPA** de la File :
  à fixer après le premier test de charge complet (jalon 3).
- **Analytique** : pas encore livrée ni présente dans le Compose.
- **Bonus Kubernetes** (k3d + HPA, ADR 022) : s'il est réalisé, la vue `Deploiement-Production` sera
  complétée par un environnement `k3d` démontré.
