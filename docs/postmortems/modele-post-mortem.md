# Post-mortem — [Titre court de l'incident]

> **Modèle à copier** pour chaque incident, sous le nom `AAAA-MM-JJ-titre-court.md` dans ce dossier.
> Règle de l'ADR 018 : un post-mortem est obligatoire dès qu'un incident consomme **plus de 20 % du budget d'erreur** d'un SLO, ou s'il touche l'invariant **zéro survente**.
> Le sujet exige le post-mortem d'**un incident simulé** (module Analytique) : ce modèle sert aussi pour celui-là.
>
> **Sans recherche de coupable.** On cherche ce qui, dans le système et les processus, a permis l'incident, pas qui s'est trompé.

| | |
|---|---|
| **Date de l'incident** | AAAA-MM-JJ, de HH:MM à HH:MM |
| **Incident réel ou simulé** | Réel / Simulé (préciser l'outil : arrêt de conteneur, Toxiproxy…) |
| **Gravité** | Critique / Majeure / Mineure |
| **Rédigé par** | |
| **Relu par** | |
| **Statut des actions** | En cours / Terminées |

## 1. Résumé

*Trois ou quatre phrases : ce qui s'est passé, pendant combien de temps, quel effet pour les acheteurs et les organisateurs, comment c'est rentré dans l'ordre.*

## 2. Impact mesuré

| SLO (ADR 018) | Objectif | Valeur pendant l'incident | Budget d'erreur consommé |
|---|---|---|---|
| Entrée dans la file | 99 % en < 2 s | | |
| Réservation | 99 % en < 500 ms | | |
| Parcours d'achat disponible | 99,9 % sans 5xx | | |
| Fraîcheur de l'analytique | 95 % en < 5 s | | |
| Recherche | 99 % en < 300 ms | | |

- **Zéro survente respecté ?** Oui / Non (résultat des requêtes de contrôle de l'ADR 003)
- **Acheteurs touchés :** nombre ou estimation
- **Places, blocages ou paiements touchés :**
- **Données perdues ?** Oui / Non (événements, file, agrégats)

## 3. Chronologie

*Heures exactes, tirées de Grafana, Loki et Tempo. Distinguer ce que le système a fait et ce que l'équipe a fait.*

| Heure | Événement |
|---|---|
| HH:MM:SS | Début de l'incident (cause déclenchante) |
| HH:MM:SS | Premier symptôme visible dans les métriques |
| HH:MM:SS | Déclenchement de l'alerte (laquelle ?) |
| HH:MM:SS | Prise en compte par l'équipe |
| HH:MM:SS | Diagnostic établi |
| HH:MM:SS | Action corrective |
| HH:MM:SS | Retour à la normale (SLO rétablis) |

- **Délai de détection** (début → alerte) :
- **Délai de résolution** (début → retour à la normale) :

## 4. Détection

- Comment l'incident a-t-il été détecté : alerte de burn rate, dashboard, test, utilisateur ?
- L'alerte s'est-elle déclenchée assez tôt ? Si non, pourquoi ?
- Quelles traces, métriques et journaux ont permis le diagnostic ? *(Ajouter les liens ou captures Grafana.)*

## 5. Cause racine

*Méthode des « 5 pourquoi » : remonter de la cause apparente à la cause dans le système.*

1. Pourquoi … ?
2. Pourquoi … ?
3. Pourquoi … ?
4. Pourquoi … ?
5. Pourquoi … ?

**Cause racine retenue :**

**Facteurs aggravants** *(ce qui a élargi l'impact : absence de délai maximal, disjoncteur mal réglé, nouvelles tentatives en avalanche…)* :

## 6. Ce qui a bien fonctionné

*Les mécanismes de résilience qui ont joué leur rôle : disjoncteur, Outbox, dégradation gracieuse, expiration des blocages, rattrapage de l'Analytique… Citer les ADR concernés.*

## 7. Ce qui a mal fonctionné

*Les mécanismes absents, mal réglés ou contournés.*

## 8. Actions

| Action | Type | Responsable | Échéance | Suivi |
|---|---|---|---|---|
| | Prévention / Détection / Atténuation | P1 / P2 | | Issue, ADR ou entrée du registre de dette |

*Si une action modifie une décision d'architecture, elle passe par un nouvel ADR. Si une action est reportée, elle est inscrite dans `docs/dette-technique.md`.*

## 9. Leçons retenues

*Ce que l'équipe sait maintenant et ne savait pas avant l'incident.*
