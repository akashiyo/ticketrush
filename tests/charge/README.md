# tests/charge — Tests de charge k6

Partagé :

- **P2** : entrée dans la file, interrogation de la position, récupération du jeton.
- **P1** : réservation, paiement, et requêtes SQL de contrôle de survente.

Objectif : 50 000 acheteurs virtuels pour 5 000 places, zéro survente (scénario C-1, ADR 003). Une version réduite tourne en CI (ADR 021).
