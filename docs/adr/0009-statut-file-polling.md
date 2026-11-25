# ADR 009 — Suivi de la position dans la file : interrogation régulière pilotée par le serveur

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Pendant l'attente, l'acheteur doit voir sa position et son temps d'attente évoluer, puis savoir immédiatement qu'il est admis (ADR 008).

Deux façons de lui transmettre ces informations :
- **pousser** les mises à jour, avec une connexion ouverte en permanence (SSE ou WebSocket) ;
- laisser le client **interroger** régulièrement le serveur (polling).

Contraintes :
- **P-1** : des centaines de milliers d'acheteurs attendent **en même temps**.
- Les services doivent rester **sans état**, pour pouvoir ajouter des instances à la demande (cours, partie 9).
- Le test de charge k6 doit pouvoir simuler ces 50 000 acheteurs de façon réaliste.

## Décision

**L'acheteur interroge régulièrement le serveur, à un rythme que le serveur décide.**

```
GET /files/{evenementId}/position
→ { "position": 18342, "attenteEstimeeSec": 92, "prochainAppelDansSec": 15 }
→ ou { "admis": true, "jetonAcces": "eyJ…" }
```

- **Le serveur fixe le délai avant le prochain appel** selon la position : loin dans la file, toutes les 20 à 30 s ; près de l'admission, toutes les 2 à 5 s. La charge reste maîtrisée, et l'acheteur proche de son tour est prévenu rapidement.
- Côté navigateur, c'est TanStack Query qui gère ces interrogations, avec l'intervalle renvoyé par le serveur.
- **Estimation de charge**, à vérifier au test : les 50 000 acheteurs virtuels du test de charge, qui interrogent en moyenne toutes les 15 s, font environ 3 300 requêtes par seconde. Chacune coûte un `ZRANK` dans Redis, ce que Redis traite largement, et quelques instances de la File d'attente suffisent.

**Le SSE est réservé au dashboard en direct des organisateurs** (module Analytique). Il y a peu de clients, chacun reçoit un flux continu de données, et la connexion ouverte y est justifiée.

## Alternatives écartées

- **SSE pour la file.** Chaque acheteur garderait une connexion ouverte pendant toute l'attente : des centaines de milliers de connexions à maintenir sur des serveurs Node. Les instances ne seraient plus interchangeables, puisqu'une connexion est liée à une instance. k6 simule mal des dizaines de milliers de flux SSE simultanés, et la preuve de charge serait fragile.
- **WebSocket.** Il a les mêmes défauts que SSE, plus un protocole bidirectionnel dont nous n'avons pas besoin : l'acheteur n'envoie rien pendant l'attente.
- **Une interrogation à intervalle fixe.** Il faudrait choisir entre un intervalle court (charge inutile pour les 190 000 acheteurs encore loin) et un intervalle long (l'acheteur admis le découvre tard et perd une partie de ses 10 minutes).

## Conséquences

- \+ La File d'attente reste sans état : n'importe quelle instance répond à n'importe quel acheteur, et on ajoute des instances à la demande.
- \+ La charge est prévisible et réglable par le serveur. En cas de surcharge, il peut espacer les appels de tout le monde.
- \+ Le test k6 est simple et réaliste : chaque acheteur virtuel est une boucle d'appels HTTP.
- \+ Si le réseau de l'acheteur coupe un instant, rien ne casse : le prochain appel reprend normalement.
- − L'acheteur admis apprend son admission avec quelques secondes de retard, au plus l'intervalle en cours. C'est compensé par des intervalles courts près de l'admission.
- − Même quand rien ne change, les appels continuent : c'est plus de requêtes qu'un modèle où le serveur pousse les mises à jour, mais chacune est très peu coûteuse.
