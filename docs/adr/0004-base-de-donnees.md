# ADR 004 — Base de données principale : PostgreSQL, un schéma par module

Statut : Proposé (2026-11-24) · Responsable : P1

## Contexte

Le Cœur (ADR 001) stocke les données qui demandent une cohérence forte :
- les places et leur statut, les réservations, les billets ;
- les événements, tarifs et plans de salle ;
- les organisateurs et leur journal d'audit.

Plusieurs exigences pèsent sur le choix de la base :
- **C-1** : la garantie de zéro survente doit venir de la base elle-même (ADR 003). Il faut des transactions ACID, des verrous de ligne et des contraintes d'unicité.
- **S-3** : l'isolation entre organisateurs doit être garantie au niveau des données, pas seulement par le code (ADR 016).
- **ADR 002** : chaque module possède ses données, sans accès direct d'un module aux tables d'un autre.
- **M-2** : la base tourne dans le Docker Compose, sur nos machines.

## Décision

**PostgreSQL** est la source de vérité unique du Cœur.

**Une instance, un schéma par module :**

| Schéma | Module | Contenu principal |
|---|---|---|
| `catalogue` | Catalogue | Événements, salles, plans de salle, catégories |
| `reservation` | Réservation | Places (`siege`), réservations, billets, Outbox |
| `organisateurs` | Organisateurs | Organisations, membres, tarifs, journal d'audit |

- Chaque module se connecte avec **son propre rôle PostgreSQL**, qui n'a de droits que sur son schéma. Une requête qui traverse deux schémas échoue donc à l'exécution, en plus d'être interdite par la fonction de fitness (ADR 021).
- **Keycloak** utilise une base séparée dans la même instance, qu'aucun module ne lit.
- La **File d'attente** et l'**Analytique** n'utilisent pas PostgreSQL : leurs données sont éphémères ou recalculables, et elles vivent dans Redis (ADR 008, ADR 019).
- Les connexions passent par un **pool de taille fixe** par instance du Cœur, dimensionné pour ne pas dépasser le maximum de connexions PostgreSQL quand on ajoute des instances.

## Alternatives écartées

- **MongoDB.** Les transactions sur plusieurs documents existent, mais la garantie « une place, un billet » est moins directe qu'une contrainte `UNIQUE` relationnelle. Il n'y a pas d'équivalent à la Row-Level Security pour l'isolation des organisateurs.
- **MySQL.** Il est aussi transactionnel, mais il n'a pas de Row-Level Security. Il n'offre pas non plus `RETURNING` pour savoir en un seul ordre si le blocage a réussi.
- **Une base SQL distribuée (CockroachDB, YugabyteDB).** Elle monte en charge horizontalement, mais elle est dimensionnée pour plusieurs nœuds, plus lourde à opérer, et ses transactions en conflit sont plus souvent annulées. La file d'attente limite déjà le nombre d'écritures simultanées : une seule instance PostgreSQL suffit.
- **Une base physique par module.** L'isolation est plus forte, mais il faut trois conteneurs et trois sauvegardes au lieu d'un. Les schémas séparés avec des rôles distincts donnent la même frontière logique pour un coût bien plus faible.

## Conséquences

- \+ Transactions ACID, verrous de ligne, `RETURNING`, contraintes d'unicité et Row-Level Security : tout ce qu'exigent les ADR 003 et 016, dans un seul outil.
- \+ Le monolithe modulaire garde des transactions locales, et les frontières entre modules sont imposées par les droits de la base.
- \+ L'outil est connu, documenté, et testable avec Testcontainers dans la CI.
- − L'instance unique est un point de défaillance unique pour le Cœur. Une réplique de secours et une bascule automatique sont des évolutions à documenter, pas prévues dans le Compose.
- − Le débit d'écriture d'une instance fixe le plafond de la réservation. Ce plafond est assumé : la File d'attente règle son rythme d'admission pour rester en dessous.
- − Extraire plus tard un module en service demandera de déplacer son schéma vers une base dédiée. C'est facilité par l'absence de jointures entre schémas.
