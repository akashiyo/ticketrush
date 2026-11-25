# ADR 008 — File d'attente virtuelle : sorted set Redis et admission à débit contrôlé

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

À l'ouverture d'une vente, des centaines de milliers de personnes arrivent en même temps pour quelques milliers de places. Si toutes atteignaient la réservation, PostgreSQL serait submergé (ADR 004). L'ordre d'obtention des places dépendrait du hasard du réseau, pas de l'ordre d'arrivée.

Le sujet exige :
- une **entrée contrôlée** dans la vente ;
- l'affichage de la **position** et du **temps d'attente** ;
- une protection contre les **accès en double**.

Scénarios concernés :
- **P-1** : 50 000 acheteurs virtuels pour 5 000 places à l'ouverture, chacun reçoit sa position en moins de 2 s au p99.
- **E-1** : les admissions respectent l'ordre de la file à 100 %, et aucun compte n'a deux positions.
- **C-1 et P-2** : la réservation ne doit jamais recevoir plus de demandes qu'elle n'en traite.

## Décision

**Une file par vente, dans un sorted set Redis**, gérée par le service File d'attente.

**1. L'entrée dans la file.** L'acheteur est connecté (ADR 010) et a résolu le défi anti-robots (ADR 012).

```
ZADD file:<evenementId> NX <score> <acheteurId>
```

- `NX` garantit **une seule position par compte** : une seconde entrée du même acheteur, depuis un autre onglet ou un autre appareil, ne change rien.
- **L'équité à l'ouverture** :
  - les acheteurs arrivés **avant** l'ouverture (la salle d'attente) reçoivent un score **tiré au hasard**. Arriver 2 heures en avance ne donne pas d'avantage sur quelqu'un arrivé 5 minutes avant, et un robot qui se connecte en continu ne gagne rien ;
  - les acheteurs arrivés **après** l'ouverture reçoivent l'heure de leur arrivée, mesurée par le serveur, donc premier arrivé, premier servi.

**2. La position et le temps d'attente.**
- `ZRANK` donne la position, avec un coût logarithmique, quelle que soit la taille de la file.
- Le temps d'attente estimé vaut position ÷ débit d'admission actuel.
- Le client interroge régulièrement le serveur pour suivre sa position (ADR 009).

**3. L'admission.** Un worker d'admission unique, protégé par un verrou Redis pour éviter deux workers actifs, tourne chaque seconde :
- il retire les N premiers de la file avec `ZPOPMIN file:<evenementId> N` ;
- il émet pour chacun un jeton d'accès signé (ADR 011), récupéré par l'acheteur à sa prochaine interrogation ;
- **N, le débit d'admission, est réglable** pendant la vente. On le fixe d'après la capacité mesurée de la réservation lors des tests de charge, par exemple 200 acheteurs par seconde ;
- **N baisse automatiquement** si la latence de réservation dépasse son SLO. C'est un contrôle d'admission, tel que vu en cours.

**4. La fin de la vente.** Quand toutes les places sont vendues ou bloquées, le worker arrête les admissions et les acheteurs encore en file sont prévenus : « complet ». Si des blocages expirent, il reprend.

## Alternatives écartées

- **Une table PostgreSQL pour la file.** Des centaines de milliers d'insertions et de calculs de position au pic, dans la base qui protège justement le stock (ADR 003). C'est elle qui tomberait en premier.
- **RabbitMQ.** Une file de messages ne permet pas de demander « quelle est ma position ? ». On ne pourrait pas afficher la position, qui est exigée par le sujet.
- **Un service de file d'attente hébergé (type Queue-it).** C'est la solution réelle des billetteries, mais elle est payante, externe, absente du Docker Compose, et elle viderait de sa substance un module évalué.
- **Pas de file, mais une limitation de débit seule.** Les acheteurs refusés réessaient au hasard : aucune équité, aucune position, et une tempête de nouvelles tentatives sur le serveur.
- **Un ordre purement chronologique, même avant l'ouverture.** Il favorise ceux qui arrivent très tôt et les robots, alors que l'ouverture de la vente est le seul moment qui compte.

## Conséquences

- \+ La réservation reçoit un flux régulier et connu, au lieu du pic brut (C-1, P-2).
- \+ L'équité est explicite et défendable : tirage au sort avant l'ouverture, premier arrivé premier servi après.
- \+ La position et le temps d'attente sont exacts et peu coûteux à calculer.
- \+ Le débit d'admission est le principal réglage de la vente, et on peut le modifier pendant la soutenance.
- − Redis devient critique pour la vente : s'il perd ses données, la file est perdue. On active la persistance (AOF, écrite chaque seconde) ; la haute disponibilité (Redis Sentinel) est une évolution documentée.
- − Le worker d'admission est unique. S'il tombe, les admissions s'arrêtent jusqu'à ce qu'une autre instance reprenne le verrou, en quelques secondes.
- − L'estimation du temps d'attente devient fausse si le débit change ou si beaucoup d'acheteurs abandonnent. C'est une estimation, présentée comme telle.
