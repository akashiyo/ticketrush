# ADR 022 — Déploiement : Docker Compose en une commande, Kubernetes en bonus

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Le sujet exige un squelette **conteneurisé et lancé en une seule commande**, et une **vue de déploiement** dans le dossier arc42. Le bonus propose un déploiement **Kubernetes sur plusieurs zones avec mise à l'échelle automatique**.

La plateforme compte environ dix conteneurs :
- les 4 unités de l'ADR 001 ;
- l'application web (Nginx), Traefik et Keycloak ;
- PostgreSQL, Redis, Redpanda et Meilisearch ;
- l'observabilité.

Ils doivent démarrer **dans le bon ordre** : PostgreSQL doit être prêt et ses schémas créés avant que le Cœur démarre.

Scénario **M-2** : un membre clone le dépôt, et la plateforme complète démarre en une commande, en moins de 5 minutes.

La même machine exécute aussi le test de charge : la plateforme doit rester sobre en ressources.

## Décision

**Docker Compose est le mode de déploiement de référence.**

```
docker compose up
```

Cette commande lance toute la plateforme. Elle exécute aussi :
- les **migrations** de chaque schéma, dans un conteneur dédié qui s'arrête une fois terminé ;
- le chargement des **données de démonstration** : organisateurs, un concert, 5 000 places ;
- l'import de la **configuration Keycloak** (domaine, rôles, utilisateurs de test) depuis un fichier versionné.

**Les règles du fichier Compose :**
- **Contrôles de santé** sur chaque conteneur, et démarrage conditionné à la santé des dépendances (`depends_on` avec `condition: service_healthy`). Un service ne démarre pas tant que sa base n'est pas prête.
- **Images construites en plusieurs étapes** : l'image finale ne contient que le code compilé et ses dépendances de production.
- **Limites de mémoire et de CPU** sur chaque conteneur, pour garder des ressources au test de charge et rendre les mesures reproductibles.
- **Configuration par variables d'environnement**, avec un fichier `.env.example` versionné. Les secrets de développement sont générés localement et **jamais versionnés**.
- La File d'attente et le Cœur peuvent être lancés en **plusieurs instances** derrière Traefik, avec `docker compose up --scale`, pour montrer que les services sont sans état.

**La vue de déploiement du dossier arc42** présente deux cibles :
1. **Locale (Compose)** : ce qui est réellement livré et démontré.
2. **Cible de production (Kubernetes)** : les services sur plusieurs zones, PostgreSQL avec une réplique de secours, Redis et Redpanda répliqués, et la mise à l'échelle automatique de la File d'attente.

**Le bonus Kubernetes** utilise **k3d**, un Kubernetes léger qui tourne dans Docker en local et sans coût. La mise à l'échelle automatique (HPA) porte sur la File d'attente, le service qui encaisse le pic.

## Alternatives écartées

- **Kubernetes dès le départ.** C'est plus représentatif d'une production, mais il faut écrire et maintenir des manifestes, et le « lancer en une commande » devient plus fragile. On aurait toute la complexité sans bénéfice au jalon 2 : c'est le piège « architecture par la mode » du cours.
- **Des scripts de lancement manuels.** Ils ne sont ni reproductibles ni portables d'une machine à l'autre, et l'ordre de démarrage serait géré à la main.
- **Un hébergement cloud managé** (bases et brokers fournis par un fournisseur). C'est payant, dépendant d'un compte et d'une connexion, et le comité ne pourrait pas relancer la plateforme lui-même.

## Conséquences

- \+ N'importe qui, y compris le comité, relance la plateforme complète avec une commande (M-2).
- \+ Les contrôles de santé évitent les démarrages ratés à cause d'une base pas encore prête.
- \+ Les limites de ressources rendent les tests de charge comparables d'une exécution à l'autre.
- − Compose tourne sur **une seule machine** : pas de vraie haute disponibilité ni de répartition sur plusieurs zones. La tolérance aux pannes démontrée concerne l'arrêt de conteneurs, pas la perte d'une machine.
- − Avec une dizaine de conteneurs, le démarrage complet prend plusieurs minutes, surtout Keycloak. Il faut le prévoir avant la démo de soutenance.
- − La cible Kubernetes de la vue de déploiement n'est démontrée que si le bonus est réalisé. Sinon, elle reste une cible documentée.
