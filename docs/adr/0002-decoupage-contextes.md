# ADR 002 — Découpage en contextes délimités et en unités déployables

Statut : Proposé (2026-11-24) · Responsable : P1 · Complète l'ADR 001

## Contexte

L'ADR 001 fixe le style : un monolithe modulaire et des services séparés quand un scénario l'exige. Il reste à décider **quels contextes délimités** existent, et **dans quelle unité déployable** va chacun d'eux.

Le découpage provisoire vient du parcours d'achat :
**ouverture de la vente → entrée dans la file → admission → réservation d'une place → paiement → émission du billet**,
auquel s'ajoutent la gestion des organisateurs et le suivi en direct.

Il sera confirmé par l'Event Storming du jalon 1. Si l'atelier fait apparaître d'autres frontières, cet ADR sera remplacé par un nouveau.

## Décision

### Contextes délimités et sous-domaines

| Contexte | Responsabilité | Sous-domaine |
|---|---|---|
| **File d'attente** | Entrée contrôlée, position, temps d'attente, admission équitable, jetons d'accès | **Cœur** : c'est ce qui rend la vente équitable et tenable au pic |
| **Réservation** | Blocage temporaire des places, expiration, émission du billet après paiement | **Cœur** : garantit zéro survente |
| **Catalogue** | Événements publiés, salles, plans de salle, recherche (modèle de lecture) | Support |
| **Organisateurs** | Gestion par chaque organisateur de ses événements, tarifs et ventes ; rôles ; journal d'audit | Support |
| **Analytique** | Agrégation en flux des événements de vente, dashboard en direct, budgets d'erreur | Support |
| **Paiement** | Prestataire externe, simulé et instable | Générique : on l'achète, on ne le construit pas |
| **Identité** | Authentification, rôles (Keycloak) | Générique |

### Placement dans les unités déployables

- **Cœur** : Réservation, Catalogue (côté écriture), Organisateurs.
- **File d'attente** : seule.
- **Analytique** : seule.
- **Faux prestataire de paiement** : seul.
- **Meilisearch** porte le modèle de lecture du Catalogue (ADR 014). **Keycloak** porte l'Identité (ADR 010).

### Règles entre modules du Cœur

1. Chaque module a son propre **schéma PostgreSQL**. Aucune requête SQL ne traverse deux schémas.
2. Un module n'appelle un autre module que par son **API interne** (un dossier `api/` exporté). Ses classes internes restent invisibles.
3. Les effets entre modules qui peuvent être différés passent par des **événements** (ADR 005).
4. Ces règles sont vérifiées en CI par dependency-cruiser (ADR 021).

### Pourquoi ces regroupements

- **Réservation et Catalogue ensemble** : réserver une place suppose que l'événement et le plan de salle existent et sont en vente. Une transaction locale évite une saga à travers le réseau (C-1).
- **Organisateurs dans le Cœur** : les tarifs et les plans de salle définis par l'organisateur sont lus à chaque réservation. Les séparer créerait un appel synchrone de plus, en plein chemin critique (P-2).
- **File d'attente à part** : sa charge à l'ouverture est sans commune mesure avec le reste (P-1).
- **Analytique à part** : c'est un pur consommateur d'événements, dont la panne doit rester sans effet sur la vente (D-2).

## Alternatives écartées

- **Un service par contexte.** Six services, et une saga entre Catalogue, Organisateurs et Réservation pour une simple réservation. Le coût du distribué n'est justifié par aucun scénario (voir ADR 001).
- **Un découpage technique en couches** (front, API, base de données). Il ne suit pas le domaine : chaque fonctionnalité traverse toutes les couches, et une évolution métier touche tout le système.
- **Le Catalogue comme service séparé, pour sa charge en lecture.** Cette charge est déjà absorbée par Meilisearch et le cache (ADR 014 et 015). Le côté écriture du Catalogue est faible et partage les données de la Réservation.

## Conséquences

- \+ Le langage du domaine reste propre à chaque contexte : dans la File d'attente, une « admission » n'est pas une « réservation ».
- \+ La carte de contexte et le diagramme C4 des conteneurs découlent directement de ce découpage.
- \+ Un module du Cœur peut être extrait plus tard sans réécrire les autres, puisque ses dépendances passent déjà par une API ou par des événements.
- − Le découpage repose sur notre compréhension actuelle du domaine. Il peut évoluer après l'Event Storming.
- − Garder des schémas séparés dans la même base demande de la discipline : il faut une migration par module et aucune jointure entre schémas.
