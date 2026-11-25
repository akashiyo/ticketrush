# ADR 014 — Modèle de lecture du catalogue (CQRS) : projection vers Meilisearch

Statut : Accepté (2026-11-24) · Responsable : P1

## Contexte

Le module Catalogue exige un **modèle de lecture séparé (CQRS)** et une recherche par **date, lieu et artiste**.

Deux usages très différents se croisent sur les mêmes données :
- **les organisateurs** créent et modifient leurs événements dans leur dashboard. Les écritures sont peu nombreuses, doivent être visibles immédiatement, et chaque organisateur ne voit que ses données (S-3) ;
- **les acheteurs** cherchent dans tout le catalogue public. Les lectures sont massives, surtout pendant une mise en vente, où des dizaines de milliers de personnes cherchent et rafraîchissent en même temps.

Le risque : si ces recherches passent par PostgreSQL, elles **concurrencent la base qui protège le stock** (ADR 003) au pire moment.

Scénario **P-3** : recherches pendant le test de charge (50 000 acheteurs virtuels) → recherche en moins de 300 ms au p99, et p99 de la réservation dégradé de moins de 10 %.

Les acheteurs attendent aussi la tolérance aux fautes de frappe (« Beyonse »), l'autocomplétion et des filtres (ville, date, genre, prix).

## Décision

**CQRS avec un moteur de recherche dédié : Meilisearch.**

- **Côté écriture (commande)** : le module Catalogue, avec les données des Organisateurs, écrit dans PostgreSQL. Le back-office lit **toujours** PostgreSQL, protégé par la Row-Level Security (ADR 016).
- **La projection** : un consommateur du module Catalogue lit `EvenementPublie`, `EvenementModifie`, `TarifModifie`, et les disponibilités par catégorie dérivées de `PlaceBloquee`, `BlocageExpire` et `BilletEmis` (ADR 005 et 006). Il met à jour l'index `evenements` de Meilisearch.
  - Chaque document porte le **numéro de version** de l'événement : une mise à jour plus ancienne que celle déjà indexée est ignorée, ce qui gère le désordre et les doublons.
  - L'index ne contient **que les événements publiés**, donc uniquement des données publiques.
- **Côté lecture (requête)** : la recherche publique interroge **uniquement** Meilisearch.
  - Champs recherchables : titre, artiste, salle, ville.
  - Champs filtrables : date, ville, genre, fourchette de prix, disponibilité.
- **La reconstruction** : l'index peut être recréé à tout moment, en rejouant les événements de Redpanda (rétention de 7 jours) ou en relisant PostgreSQL.

## Alternatives écartées

- **La recherche plein texte de PostgreSQL.** C'est suffisant en volume, puisqu'elle gère des millions de lignes avec un index adapté. Mais les recherches du pic tomberaient sur la même instance que les réservations (P-3). Il n'y a pas non plus de tolérance aux fautes de frappe native, et les facettes sont plus difficiles à construire.
- **Elasticsearch ou OpenSearch.** Ils offrent toutes les fonctions voulues, plus des agrégations analytiques poussées. Mais ils tournent sur la machine virtuelle Java, avec au moins 1 à 2 Go de RAM, alors que nos machines exécutent aussi tout le Compose et 50 000 acheteurs virtuels. Leurs agrégations avancées ne servent pas à la recherche de billets.
- **Des réplicas PostgreSQL en lecture.** Ils déchargent bien l'instance principale, mais n'apportent aucune fonction de recherche. Ils ajoutent un décalage de réplication à gérer, sans réel bénéfice face à un moteur dédié.
- **Faire passer le back-office des organisateurs par Meilisearch.** Meilisearch n'a pas d'équivalent à la Row-Level Security : un filtre oublié exposerait les brouillons d'un organisateur à un autre. Le back-office reste donc sur PostgreSQL.

## Conséquences

- \+ Les recherches du pic n'atteignent jamais PostgreSQL : la réservation est protégée (P-3).
- \+ Tolérance aux fautes, autocomplétion et filtres sont disponibles sans développement spécifique.
- \+ Meilisearch tient en un seul binaire léger, de l'ordre de 100 à 200 Mo de RAM, compatible avec le Compose.
- \+ C'est une illustration directe du CQRS du cours : un modèle d'écriture, une projection et un modèle de lecture.
- − Le catalogue public est **cohérent à terme** : un événement publié devient visible après quelques secondes. Les disponibilités affichées sont **indicatives**, et seule la réservation dans PostgreSQL fait foi (ADR 003).
- − Un composant de plus à exploiter. Si Meilisearch tombe, la recherche est indisponible, mais les pages d'événement restent servies par le Cœur et son cache (ADR 015) : c'est une dégradation gracieuse.
- − Meilisearch est moins connu du comité qu'Elasticsearch : il faudra savoir expliquer ce choix en soutenance.
