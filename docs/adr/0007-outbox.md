# ADR 007 — Publication fiable des événements : Outbox simple et consommateurs idempotents

Statut : Proposé (2026-11-24) · Responsable : P1

## Contexte

Le Cœur modifie PostgreSQL, par exemple en émettant un billet, **et** doit publier l'événement correspondant sur Redpanda (ADR 005, ADR 006).

Écrire en base **puis** publier, c'est la « double écriture » décrite en cours : si le Cœur tombe entre les deux, le billet existe mais personne n'est prévenu. Le dashboard des ventes est alors faux, et le catalogue affiche des places déjà vendues.

Contraintes :
- **D-2** : aucun événement de vente ne doit être perdu, même si le broker ou un consommateur est en panne.
- Le module « Réservation et paiement » ne fait **pas** partie de notre périmètre : nous n'implémentons pas de saga avec compensations. Il nous faut seulement une publication fiable, la plus simple possible.

## Décision

**Le pattern Outbox, avec un relais par interrogation régulière de la table (polling).**

**1. L'écriture.** L'événement est inséré dans une table `outbox` **dans la même transaction** que la modification métier :

```sql
CREATE TABLE reservation.outbox (
  id            uuid PRIMARY KEY,
  topic         text NOT NULL,
  cle           text NOT NULL,          -- clé de partition : identifiant de l'événement (concert)
  type          text NOT NULL,          -- ex. 'BilletEmis'
  contenu       jsonb NOT NULL,
  traceparent   text,                   -- contexte de trace OpenTelemetry (ADR 017)
  cree_le       timestamptz NOT NULL DEFAULT now(),
  publie_le     timestamptz
);
```

Les schémas `catalogue` et `organisateurs` ont chacun leur propre table `outbox`, pour respecter la règle « aucune écriture dans le schéma d'un autre module » (ADR 002).

**2. Le relais.** C'est une tâche planifiée NestJS, toutes les 200 ms :

```sql
SELECT * FROM reservation.outbox
WHERE  publie_le IS NULL
ORDER  BY cree_le
LIMIT  500
FOR UPDATE SKIP LOCKED;   -- plusieurs instances du Cœur ne publient pas le même lot
```

Il publie le lot sur Redpanda, puis remplit `publie_le`. Les lignes publiées depuis plus de 7 jours sont supprimées chaque nuit.

**3. Les consommateurs sont idempotents.** Le relais garantit une livraison **au moins une fois** : un crash après la publication mais avant `publie_le` provoque une seconde publication. Chaque consommateur mémorise donc l'`id` des événements déjà traités, dans la même transaction que son traitement, ou dans Redis avec un `SET NX` pour l'Analytique. Il ignore les doublons.

## Alternatives écartées

- **La double écriture, base puis broker.** Un crash entre les deux perd l'événement. C'est le problème que l'Outbox résout.
- **La capture des changements de la base avec Debezium (CDC).** Elle est plus réactive, parce qu'elle lit le journal de PostgreSQL au lieu d'interroger la table, mais elle ajoute un conteneur Kafka Connect et une configuration délicate. Un délai de 200 ms suffit à notre analytique « temps réel ».
- **Les transactions Kafka côté producteur.** Elles garantissent l'atomicité entre topics Kafka, pas entre PostgreSQL et Kafka. Elles ne résolvent pas la double écriture.
- **Une saga avec compensations.** Elle est exigée par le module « Réservation et paiement », que nous n'avons pas retenu. Notre réservation et notre paiement restent dans une transaction locale du Cœur.

## Conséquences

- \+ Aucun événement n'est perdu : si Redpanda est arrêté, les événements s'accumulent dans `outbox` et partent à son retour (D-2).
- \+ L'événement n'est publié que si la transaction métier a réussi : pas d'événement « fantôme » pour un billet annulé.
- \+ Le contexte de trace stocké avec l'événement permet de suivre une vente de bout en bout, de la réservation jusqu'au dashboard (O-1).
- − Les événements arrivent avec 200 ms de retard au maximum, plus le temps de traitement. C'est acceptable pour l'analytique et le catalogue, qui sont cohérents à terme.
- − L'interrogation régulière ajoute une petite charge constante sur PostgreSQL. L'index partiel `WHERE publie_le IS NULL` la garde négligeable.
- − Chaque consommateur doit implémenter la déduplication. Une erreur à cet endroit compterait deux fois une vente dans l'analytique, sans jamais créer de survente.
