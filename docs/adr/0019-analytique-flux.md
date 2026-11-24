# ADR 019 — Analytique en flux : consommateur KafkaJS, agrégats dans Redis, envoi en direct par SSE

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Le module Analytique temps réel exige :
- un **traitement de flux** des événements de vente ;
- un **tableau de bord temps réel pour les organisateurs** ;
- des budgets d'erreur et des alertes sur les SLO (ADR 018).

Il faut distinguer **deux tableaux de bord** :
- **Grafana** sert à l'équipe d'exploitation : latences, erreurs, SLO (ADR 017) ;
- **le dashboard en direct des organisateurs** est une page de l'application, dans `/organisateur`. Il montre à chaque organisateur **ses** ventes en cours : places vendues par minute, taux de remplissage par catégorie, chiffre d'affaires, longueur de la file.

Contraintes :
- **D-2** : l'arrêt de l'Analytique ne doit provoquer aucune erreur côté achat. À son redémarrage, elle rattrape les événements en moins de 5 minutes.
- **S-3** : un organisateur ne voit jamais les ventes d'un autre.
- **ADR 020** : tout le code est en TypeScript, pour que chacun puisse le défendre.
- **SLO de fraîcheur** (ADR 018) : 95 % des ventes sont visibles en moins de 5 s.

## Décision

**Le service Analytique est un consommateur KafkaJS**, dans un groupe de consommateurs. Il lit les topics `reservation.ventes`, `file.admissions` et `catalogue.evenements` (ADR 006).

**1. Les agrégats par fenêtres de temps**, par événement (concert), calculés au fil de l'eau :
- des fenêtres fixes d'**une seconde** et d'**une minute** : ventes, blocages, expirations, admissions, chiffre d'affaires ;
- des **compteurs cumulés** : places vendues par catégorie, taux de remplissage ;
- **les événements en retard** (horodatés avant une fenêtre déjà close) sont acceptés pendant 10 secondes de grâce. Au-delà, ils sont ajoutés au cumul et comptés comme retardataires, mais pas réaffectés à leur fenêtre.

**2. Le stockage des agrégats dans Redis**, avec une durée de vie : ce sont des données recalculables, pas une source de vérité.

**3. L'idempotence et la reprise après panne**
- Un petit script Lua exécuté dans Redis fait, **en une seule opération atomique** : « si l'identifiant de l'événement n'est pas encore connu, l'enregistrer et mettre à jour les agrégats ; sinon, ne rien faire ». Un doublon, provoqué par l'Outbox ou par un rejeu, est ainsi ignoré (ADR 007).
- La position de lecture dans Redpanda n'est validée **qu'après** l'écriture dans Redis. Après un arrêt, l'Analytique relit depuis sa dernière position validée sans compter deux fois.

**4. L'envoi en direct au dashboard par SSE**
- Une connexion par organisateur connecté, avec une mise à jour par seconde.
- Avant d'ouvrir le flux, le service vérifie le jeton Keycloak (rôle organisateur) et que le concert demandé **appartient à son organisation**. La correspondance concert → organisation vient de l'événement `EvenementPublie`.

## Alternatives écartées

- **Apache Flink, Kafka Streams ou ksqlDB.** Ce sont les outils de référence du traitement de flux : état distribué, fenêtres avancées, garanties « exactement une fois ». Mais ils imposent Java ou un moteur à exploiter en plus, hors des compétences de l'équipe. Nos agrégats (comptages par fenêtre) n'en ont pas besoin.
- **Des requêtes SQL périodiques sur PostgreSQL.** Ce n'est pas du flux : il y a des secondes de retard, et surtout une charge de lecture sur la base des réservations en plein pic (ADR 003).
- **Montrer Grafana aux organisateurs.** Grafana n'est pas conçu pour des clients externes multi-tenant. Isoler chaque organisateur y serait fragile, et l'interface n'est pas destinée à un utilisateur métier.
- **WebSocket pour le dashboard.** L'organisateur ne fait que recevoir des données : SSE suffit, avec une reconnexion automatique native dans le navigateur.

## Conséquences

- \+ Le code reste en TypeScript et tient dans un seul service, compréhensible par les deux membres du binôme.
- \+ L'arrêt de l'Analytique ne touche pas la vente. Au redémarrage, elle rattrape son retard grâce à la rétention de Redpanda (D-2), ce qui fait une démonstration de panne idéale.
- \+ Le module réutilise ce que la partie commune impose déjà (événements, Redis, SLO). C'est pour cela qu'il a été choisi comme niveau 3.
- − Le traitement tourne sur **une seule instance** : l'état des fenêtres est dans Redis, mais deux instances concurrentes pourraient se disputer les fenêtres. Pour monter en charge, il faudra répartir les partitions entre instances. C'est documenté comme limite.
- − L'effet « exactement une fois » repose sur le script Lua atomique : sans lui, un crash entre l'enregistrement de l'identifiant et la mise à jour des agrégats pourrait perdre ou doubler un comptage. Ce point devra être couvert par un test d'intégration.
- − Les chiffres du dashboard sont **indicatifs**. Les ventes exactes, celles qui font foi pour la facturation, restent dans PostgreSQL et le back-office (ADR 016).
