# ADR 015 — Stratégie de cache : cache-aside Redis invalidé par événements, et cache HTTP de l'application

Statut : Proposé (2026-11-24) · Responsable : P1

## Contexte

Le module Catalogue exige une **stratégie de cache justifiée**.

Pendant une mise en vente, tous les acheteurs consultent **la même page** : celle du concert en vente, avec sa salle, son plan et ses tarifs. Sans cache, chacune de ces consultations interroge PostgreSQL. C'est la base qui protège le stock (ADR 003), au moment où elle est le plus sollicitée (P-3).

Toutes les données n'ont pas la même tolérance au retard :
- **le titre, la salle, le plan de salle et les tarifs** changent très rarement, et jamais pendant une vente en cours ;
- **les disponibilités par catégorie** changent à chaque seconde du pic ;
- **le statut d'une place précise** décide de la vente : il ne doit **jamais** provenir d'un cache.

Le cours met en garde contre l'**avalanche** : quand une clé très demandée expire, toutes les requêtes en attente frappent la base en même temps.

## Décision

**Trois niveaux de cache, chacun pour un type de donnée :**

**1. Le cache HTTP de l'application web** (servie par Nginx derrière Traefik, ADR 013)
- Les fichiers JS et CSS ont un nom qui contient leur empreinte : ils sont mis en cache **un an**, avec la mention « ne change jamais » (`immutable`).
- Le fichier `index.html` n'est **pas** mis en cache, pour qu'un déploiement soit visible tout de suite.

**2. Un cache-aside dans Redis pour les fiches d'événement** (titre, salle, plan, tarifs)
- Le Cœur lit d'abord Redis. En cas d'absence, il lit PostgreSQL et écrit le résultat dans Redis.
- La durée de vie est de 10 minutes, avec une part d'aléatoire de plus ou moins 10 % : les clés n'expirent pas toutes en même temps.
- L'entrée est **invalidée immédiatement** à la réception d'un événement `EvenementModifie` ou `TarifModifie` (ADR 005). La durée de vie n'est qu'un filet de sécurité.
- **Contre l'avalanche** : quand une clé est absente, **une seule** requête recharge la donnée, grâce à un verrou Redis de courte durée. Les autres attendent quelques millisecondes et relisent le cache.
- Avant l'ouverture d'une vente, la fiche de l'événement est **préchargée** dans le cache.

**3. Les disponibilités par catégorie** viennent de la projection (ADR 014). Elles sont affichées comme **indicatives** (« il reste environ 1 200 places en fosse ») et ne sont jamais mises en cache côté Cœur.

**Ce qui n'est jamais mis en cache** : le statut d'une place, les réservations et les billets. La décision de vente lit et écrit toujours PostgreSQL.

## Alternatives écartées

- **Pas de cache.** PostgreSQL absorberait toutes les consultations de la page du concert, en concurrence directe avec les réservations.
- **Une durée de vie seule, sans invalidation.** Pour rester raisonnablement à jour, il faudrait une durée courte, donc plus de lectures en base. Avec une durée longue, un tarif modifié resterait faux pendant longtemps.
- **Un cache en mémoire dans chaque instance du Cœur.** Chaque instance aurait sa propre copie : plusieurs versions coexisteraient, et l'invalidation devrait atteindre chaque instance. Redis donne une copie unique.
- **Un CDN devant l'API.** C'est pertinent en production, mais absent du Docker Compose. Il est documenté comme évolution : le cache HTTP de l'application est déjà compatible.

## Conséquences

- \+ La page du concert en vente ne touche presque jamais PostgreSQL pendant le pic.
- \+ Une modification par l'organisateur est visible en quelques secondes, grâce à l'invalidation par événements.
- \+ Le verrou et la part d'aléatoire protègent contre l'avalanche décrite en cours.
- − Redis porte une responsabilité de plus : la file, l'anti-rejeu et maintenant le cache. Une panne de Redis fait retomber les lectures sur PostgreSQL, ce qui est acceptable puisque la file d'attente est elle aussi arrêtée dans ce cas.
- − Si un événement d'invalidation se perd, le cache reste faux jusqu'à sa durée de vie, 10 minutes au plus. L'Outbox (ADR 007) rend ce cas très improbable.
- − Les disponibilités affichées peuvent différer de quelques places de la réalité. Il faut le dire dans l'interface.
