# ADR 006 — Broker d'événements : Redpanda

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

L'ADR 005 fait circuler entre contextes des événements de vente, de catalogue et de file d'attente. Le broker qui les transporte doit répondre à quatre besoins :
- **conserver l'historique** des événements et permettre de le **rejouer**. L'Analytique doit rattraper son retard après une panne (D-2), et la projection Meilisearch doit pouvoir être reconstruite (ADR 014) ;
- **garder l'ordre** des événements d'une même vente ;
- permettre d'**ajouter des consommateurs** sans toucher aux producteurs (M-1) ;
- **tourner dans le Docker Compose**, sur une machine qui exécute aussi le test de charge (M-2).

Le bonus du sujet demande en plus un **registre de schémas** pour les événements.

## Décision

**Redpanda**, un broker compatible avec le protocole Kafka. Les services utilisent la bibliothèque KafkaJS.

**Les sujets (topics), un par contexte producteur :**

| Topic | Producteur | Exemples d'événements |
|---|---|---|
| `catalogue.evenements` | Cœur (Catalogue, Organisateurs) | `EvenementPublie`, `EvenementModifie`, `TarifModifie` |
| `reservation.ventes` | Cœur (Réservation) | `PlaceBloquee`, `BlocageExpire`, `BilletEmis` |
| `file.admissions` | File d'attente | `AcheteurEntreDansLaFile`, `AcheteurAdmis` |

- **La clé de partition est l'identifiant de l'événement** (le concert). Tous les messages d'une même vente arrivent dans l'ordre, sur la même partition.
- **La rétention est de 7 jours** : de quoi rejouer une vente entière pour reconstruire une projection.
- Les schémas d'événements sont décrits en **AsyncAPI**. En bonus, ils sont enregistrés dans le **registre de schémas intégré à Redpanda**, qui refuse un schéma incompatible.
- Dans le Compose, Redpanda tourne sur **un seul nœud**.

## Alternatives écartées

- **Apache Kafka.** Il offre les mêmes garanties, mais il tourne sur la machine virtuelle Java, avec plus de mémoire et un démarrage plus long, et son registre de schémas est un conteneur à part. Redpanda parle le même protocole : passer à Kafka plus tard ne change pas le code.
- **RabbitMQ.** Un message consommé disparaît. L'Analytique ne pourrait pas rejouer une vente après une panne, ni la projection être reconstruite. Le cours relève la même limite dans l'exemple d'ADR sur FoodExpress.
- **Redis Streams.** Redis est déjà dans la stack, ce qui économiserait un conteneur. Mais sa rétention est limitée par la mémoire, il n'a pas de registre de schémas, et on concentrerait la file d'attente, le cache, l'anti-rejeu et les événements dans une seule instance Redis, qui deviendrait un point de défaillance unique pour presque tout.
- **NATS JetStream.** Il est léger et rejouable, mais moins outillé dans l'écosystème Kafka. Il n'est pas vu en cours, donc plus coûteux à défendre sans bénéfice clair.

## Conséquences

- \+ Une panne de l'Analytique n'entraîne aucune perte : à son redémarrage, elle reprend à son dernier message lu (D-2).
- \+ Un nouveau consommateur lit l'historique sans rien demander au producteur (M-1).
- \+ L'ordre des événements est garanti par vente, ce qui suffit à nos agrégats.
- \+ Le registre de schémas intégré couvre le bonus sans conteneur supplémentaire.
- − Un composant de plus à exploiter et à superviser.
- − Avec un seul nœud, le broker est un point de défaillance unique pour les flux asynchrones. La vente continue grâce à l'Outbox (ADR 007), qui garde les événements jusqu'au retour du broker. La réplication sur 3 nœuds est l'évolution prévue.
- − La livraison est garantie « au moins une fois » : les consommateurs doivent ignorer les doublons.
