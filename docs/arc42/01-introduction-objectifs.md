# 1. Introduction et objectifs

## 1.1 Le besoin

TicketRush est une plateforme de billetterie pour concerts et événements sportifs. Lors des mises en
vente les plus attendues, **plusieurs centaines de milliers de personnes se connectent au même
instant pour quelques milliers de places**.

La plateforme doit :

- **absorber le pic** d'ouverture d'une vente ;
- **rester équitable** entre les acheteurs, robots compris ;
- **résister aux pannes** d'un service ou du prestataire de paiement ;
- **ne jamais vendre deux fois la même place**.

Périmètre fonctionnel retenu (binôme avec la charge d'un trinôme) : la partie commune (squelette de
bout en bout : catalogue → réservation → paiement simulé → billet) et quatre modules :

| Module                             | Niveau | Contenu                                                              |
| ---------------------------------- | ------ | -------------------------------------------------------------------- |
| Catalogue et recherche             | 1      | Événements, salles, plans de salle ; recherche ; CQRS et cache       |
| Organisateurs multi-tenants        | 1      | Gestion des événements, tarifs, ventes ; isolation ; rôles ; audit   |
| File d'attente virtuelle           | 2      | Entrée contrôlée, position, jetons signés, anti-robots, anti-doublons |
| Analytique temps réel et fiabilité | 3      | Flux de ventes, dashboard en direct, budgets d'erreur, post-mortem   |

Prévu mais non prioritaire : l'envoi du billet par e-mail, en plus de son affichage dans l'application.

Hors périmètre : le module « Réservation et paiement » complet (saga, compensations) et le module
« Revente et billets infalsifiables ». La réservation et le paiement simulé restent dans le squelette.

## 1.2 Objectifs de qualité prioritaires

Les cinq qualités qui pilotent l'architecture, par ordre de priorité. Le détail mesurable est dans
la [section 10](10-exigences-qualite.md).

| Priorité | Qualité                      | Ce que cela veut dire pour TicketRush                                                     | Scénarios      |
| -------- | ---------------------------- | ----------------------------------------------------------------------------------------- | -------------- |
| 1        | **Cohérence du stock**       | Zéro survente, quelle que soit la charge, même si le code a un bug                        | C-1            |
| 2        | **Performance au pic**       | L'entrée dans la file, la recherche et la réservation restent rapides à l'ouverture ; le dashboard des organisateurs reste à jour | P-1 à P-4 |
| 3        | **Disponibilité, résilience** | La panne du paiement ou de l'analytique n'arrête pas la vente et ne perd aucun événement | D-1 à D-3      |
| 4        | **Équité et sécurité**       | Ordre d'admission juste, robots refusés, jetons infalsifiables, organisateurs isolés      | E-1, S-1 à S-4 |
| 5        | **Exploitabilité, évolutivité** | On voit ce qui se passe pendant la vente ; on démarre et on étend le système facilement | O-1, M-1 à M-3 |

Compromis assumé : la cohérence passe avant la disponibilité pour la décision de vente (au sens de
CAP/PACELC vu en cours). Si PostgreSQL ne peut pas confirmer un blocage, la place n'est pas vendue.
Les données affichées (disponibilités, analytique) tolèrent un léger retard.

## 1.3 Parties prenantes

| Partie prenante                            | Rôle                                                                    | Attentes principales                                                                               | Qualités concernées           |
| ------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Acheteur**                               | Cherche un événement, attend son tour, réserve, paie, reçoit son billet | Une chance équitable ; savoir où il en est (position, attente) ; ne pas payer une place inexistante | Équité, performance, cohérence |
| **Organisateur** (admin, gestionnaire, lecteur) | Publie ses événements et ses tarifs, suit ses ventes               | Une vente qui se remplit sans incident ; ses données invisibles des concurrents ; un suivi en direct | Sécurité (isolation), disponibilité |
| **Opérateur TicketRush** (le métier)       | Exploite la plateforme et en tire ses revenus                           | Aucune survente (coût et réputation) ; pas de vente ratée médiatisée ; maîtrise des coûts          | Cohérence, disponibilité       |
| **Exploitant** (astreinte, SRE)            | Surveille et pilote la mise en vente                                    | Voir l'état de la vente en temps réel ; être alerté avant l'acheteur ; diagnostiquer vite          | Observabilité                  |
| **Équipe de développement** (P1, P2)       | Conçoit, code et défend le système                                      | Un système que deux personnes peuvent expliquer en entier ; des frontières qui tiennent ; une CI fiable | Maintenabilité, testabilité   |
| **Prestataire de paiement**                | Système externe qui autorise et débite                                  | Des appels idempotents ; pas de rafale de nouvelles tentatives quand il est en difficulté           | Résilience (côté appelant)     |
| **Comité d'architecture** (enseignant)     | Évalue le projet, injecte des pannes en soutenance                      | Des décisions justifiées par des scénarios mesurés ; des preuves (charge, cohérence, résilience)    | Toutes, avec preuves           |
| **Autorités** (CNIL, RGPD)                 | Encadrent le traitement des données personnelles                        | Minimiser les données des acheteurs ; ne pas confier de données à des tiers sans nécessité          | Sécurité, confidentialité      |
