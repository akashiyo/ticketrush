# 3. Contexte et périmètre

## 3.1 Contexte métier (C4 niveau 1)

Vue générée depuis [`../architecture/workspace.dsl`](../architecture/workspace.dsl), vue `Contexte`.
Au niveau 1, pas de technologie : uniquement les acteurs, le système et ses dépendances externes.

| Acteur ou système          | Type     | Ce qu'il envoie à TicketRush                                                | Ce qu'il en reçoit                                                    |
| -------------------------- | -------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Acheteur**               | Personne | Recherches, entrée dans la file, choix de place, paiement                   | Résultats, position et attente estimée, place bloquée ou refusée, billet |
| **Organisateur**           | Personne | Événements, salles, plans de salle, tarifs ; ouverture de la vente          | Ses ventes, son journal d'audit, son dashboard en direct              |
| **Exploitant**             | Personne | Réglage du débit d'admission, consultation                                  | Tableau de bord de la vente, SLO, alertes, traces                     |
| **Prestataire de paiement** | Système externe | Paiement accepté, refusé, ou pas de réponse dans le délai             | Demandes de paiement avec clé d'idempotence                           |

Le prestataire de paiement est **externe** dans le modèle : TicketRush ne le construit pas
(sous-domaine générique, ADR 002). Dans le projet, il est remplacé par un **faux prestataire
volontairement instable** (unité déployable de P2), qu'on peut couper pendant la démonstration
(scénario D-1).

## 3.2 Contexte technique

| Interface                         | Protocole                                 | Remarque                                                       |
| --------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| Navigateur → TicketRush           | HTTPS, REST + JSON (OpenAPI)              | Point d'entrée unique Traefik (ADR 013)                         |
| Connexion des utilisateurs        | OpenID Connect, code + PKCE               | Keycloak, déployé avec TicketRush : il fait partie du système (ADR 010) |
| TicketRush → prestataire de paiement | HTTPS, REST + JSON, clé d'idempotence  | Délai 2 s, nouvelles tentatives, disjoncteur (ADR 005)          |

## 3.3 Afficher les diagrammes

Avec Docker, depuis la racine du dépôt :

```
docker run --rm -p 8080:8080 -v ./docs/architecture:/usr/local/structurizr structurizr/lite
```

puis ouvrir `http://localhost:8080`.
