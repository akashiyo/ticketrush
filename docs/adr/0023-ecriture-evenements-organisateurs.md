# ADR 023 — Écriture des événements dans le module Organisateurs, Catalogue en lecture seule

Statut : Proposé (2026-11-25) · Responsable : P1 · Précise l'ADR 014 (côté écriture) · Complète les ADR 002 et 016

## Contexte

L'ADR 014 sépare l'écriture et la lecture du catalogue (CQRS) et écrit : « le module Catalogue, avec les données des Organisateurs, écrit dans PostgreSQL ». Au moment d'écrire le module Organisateurs, cette phrase entre en conflit avec trois décisions déjà prises :

- **ADR 016** : chaque modification du back-office et sa ligne du journal `organisateurs.audit` sont écrites **dans la même transaction** (scénario S-4), et la Row-Level Security protège les tarifs et les événements de chaque organisateur (S-3).
- **ADR 005** : le producteur de `EvenementPublie`, `EvenementModifie` et `TarifModifie` est « Cœur (Organisateurs) ».
- **ADR 002** : un module n'écrit que dans son propre schéma, et n'appelle un autre module que par son `api/` ; ces règles sont vérifiées en CI (M-3).

Si les tables des événements restaient dans le schéma `catalogue`, l'audit dans la même transaction obligerait à faire passer une transaction d'un module à l'autre : un couplage que les règles de dépendances interdisent.

## Décision

**Le module Organisateurs porte l'écriture des événements ; le Catalogue ne fait que lire.**

| Module | Schéma | Contenu | Rôle dans le CQRS |
|---|---|---|---|
| **Organisateurs** | `organisateurs` | `salle`, `evenement`, `tarif` (RLS), `audit` (RLS, ajout seul), `outbox` | Écriture : règles métier, rôles, audit ; publie les événements du catalogue |
| **Catalogue** | `catalogue` | `fiche` (une vue par événement publié) + l'index Meilisearch `evenements` | Lecture : projection des événements, recherche, fiches en cache Redis |

- Une modification passe par **une seule transaction** dans le schéma `organisateurs` : lecture verrouillée, règle métier, écriture, ligne d'audit avant / après, événement dans l'Outbox.
- Seuls les changements **visibles du public** sont annoncés : un brouillon n'émet rien ; la publication émet `EvenementPublie` ; une modification d'un événement publié émet `EvenementModifie` ou `TarifModifie`.
- La projection du Catalogue tient **deux vues** à jour à partir des mêmes événements : l'index de recherche (ADR 014) et la table des fiches lue derrière le cache Redis (ADR 015). Chaque vue ignore une version plus ancienne que la sienne.
- Les tables d'écriture créées un temps dans le schéma `catalogue` sont supprimées par une migration ajoutée (`0001`), sans réécrire la migration déjà livrée.

## Alternatives écartées

- **Garder les tables dans le Catalogue, Organisateurs n'étant qu'une façade HTTP.** L'audit dans la même transaction demanderait de partager la transaction entre deux modules, contraire à l'ADR 002 et refusé par les règles de dépendances ; ou alors un journal hors transaction, contraire à l'ADR 016 (« aucune action sans trace »).
- **Un journal d'audit dans le schéma `catalogue`.** Il contredit l'ADR 016 (`organisateurs.audit`) et mélange dans un même module la vue publique et les données internes des organisateurs.
- **Le Catalogue lit les fiches dans Meilisearch, sans table PostgreSQL.** Plus simple, mais une panne de Meilisearch rendrait aussi les fiches indisponibles, alors que l'ADR 015 les sert depuis PostgreSQL derrière Redis.

## Conséquences

- \+ L'audit est écrit dans la même transaction que la modification, sans couplage entre modules.
- \+ Le CQRS est net : on écrit chez les Organisateurs (RLS, rôles, audit), on lit dans le Catalogue (index, fiches) ; les deux côtés ne se parlent que par des événements du contrat.
- \+ Les vues du Catalogue se reconstruisent en rejouant `catalogue.evenements` (rétention de 7 jours).
- − Une fiche n'apparaît qu'après le passage par Redpanda et la projection : quelques centaines de millisecondes après la publication, et pas du tout si le broker est arrêté (la publication est gardée dans l'Outbox jusqu'à son retour).
- − Deux magasins de vues à tenir cohérents : une panne de l'un pendant la projection fait rejouer le message, que l'autre ignore grâce à la version.
- − La phrase « le module Catalogue écrit dans PostgreSQL » de l'ADR 014 ne décrit plus la réalité : cet ADR la précise.
