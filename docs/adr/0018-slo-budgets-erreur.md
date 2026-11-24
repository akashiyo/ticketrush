# ADR 018 — SLO et budgets d'erreur de la mise en vente

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Le sujet exige des **SLO définis et mesurés**. Le module Analytique ajoute des **budgets d'erreur**, des **alertes sur les SLO** et le **post-mortem d'un incident simulé**.

Le cours distingue :
- **le SLI**, ce qu'on mesure ;
- **le SLO**, l'objectif interne ;
- **le budget d'erreur**, la part d'échec tolérée tant que le SLO est respecté.

Une alerte doit signaler que **l'expérience des acheteurs** se dégrade, pas qu'un indicateur technique franchit un seuil arbitraire.

Particularité de TicketRush : la charge ne dure pas 30 jours. Elle se concentre sur **une mise en vente de quelques dizaines de minutes**. Un SLO mesuré seulement sur 30 jours glissants « diluerait » une vente ratée dans des semaines de calme.

## Décision

**Cinq SLO, mesurés dans Prometheus à partir des métriques OpenTelemetry (ADR 017) :**

| SLO | SLI | Objectif | Scénario |
|---|---|---|---|
| **Entrée dans la file** | Part des demandes de position qui réussissent en moins de 2 s | 99,5 % | P-1 |
| **Réservation** | Part des tentatives de blocage qui reçoivent une réponse (place obtenue ou déjà prise) en moins de 500 ms | 99 % | P-2 |
| **Parcours d'achat disponible** | Part des requêtes du parcours d'achat sans erreur serveur (5xx) | 99,9 % | D-1, D-2 |
| **Fraîcheur de l'analytique** | Part des événements de vente visibles dans le dashboard en moins de 5 s | 95 % | D-2 |
| **Recherche** | Part des recherches qui répondent en moins de 300 ms | 99 % | P-3 |

**Zéro survente n'est pas un SLO, c'est un invariant.** Il n'a pas de budget d'erreur : une seule survente déclenche une alerte critique immédiate. Une requête de contrôle tourne en continu pendant la vente (ADR 003).

**Deux fenêtres de mesure :**
- **par mise en vente** : de l'ouverture à la fin des admissions. C'est la fenêtre qui compte pour juger une vente ;
- **sur 30 jours glissants** : la vision d'ensemble, comme dans le cours.

**Alertes sur la vitesse de consommation du budget (burn rate)**, avec deux fenêtres pour éviter les fausses alertes :
- **Critique** : le budget se consomme 14 fois plus vite que prévu, sur 5 minutes **et** sur 1 minute. Pendant une vente, chaque minute compte.
- **Avertissement** : 6 fois plus vite, sur 30 minutes **et** sur 5 minutes.

Les règles Prometheus et les alertes Grafana sont versionnées dans le dépôt.

**Politique de budget** : si le budget d'une fenêtre de 30 jours est épuisé, les nouvelles fonctionnalités passent après les corrections de fiabilité, jusqu'à ce qu'il se reconstitue.

**Post-mortem** : chaque incident qui consomme plus de 20 % d'un budget donne lieu à un post-mortem sans recherche de coupable, dans `docs/postmortems/`. Il décrit la chronologie, la cause, l'impact mesuré par les SLO, et les actions. Le premier sera celui de l'incident simulé exigé par le sujet.

## Alternatives écartées

- **Des alertes sur seuils bruts** (« CPU au-dessus de 80 % », « une erreur 500 »). Elles sont bruyantes, souvent sans effet visible pour l'acheteur, et elles ratent les dégradations lentes. Le cours oriente vers les SLO.
- **Un objectif de 100 %.** Il est inatteignable, il n'y a plus de budget pour livrer, et chaque erreur isolée réveille quelqu'un. Seul zéro survente justifie une exigence absolue, d'où son traitement à part.
- **Seulement des fenêtres de 30 jours.** Une vente ratée de 20 minutes ne consommerait qu'une petite part du budget mensuel, alors qu'elle est catastrophique pour l'organisateur.
- **Un générateur de règles SLO (Sloth, Pyrra).** Il est utile à grande échelle, mais c'est un outil de plus. Pour cinq SLO, les règles écrites à la main restent lisibles et faciles à expliquer.

## Conséquences

- \+ Chaque alerte correspond à une dégradation ressentie par les acheteurs, et le comité peut la voir se déclencher pendant la démo de panne.
- \+ Les SLO relient directement l'exploitation aux scénarios de qualité de l'arbre d'utilité.
- \+ Le post-mortem de l'incident simulé a un cadre prêt à l'emploi.
- − Les objectifs chiffrés sont des hypothèses : ils devront être ajustés après le premier test de charge (jalon 3).
- − Les alertes par burn rate sont plus difficiles à expliquer qu'un seuil simple. Il faudra savoir les justifier en soutenance.
- − Pas de SLA : c'est un projet sans client contractuel. Le dossier précisera qu'un SLA éventuel serait moins exigeant que ces SLO, comme le rappelle le cours.
