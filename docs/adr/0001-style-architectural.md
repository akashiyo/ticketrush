# ADR 001 — Style architectural : monolithe modulaire et services séparés là où un scénario l'exige

Statut : Proposé (2026-11-24) · Responsable : P1

## Contexte

TicketRush doit absorber l'ouverture d'une vente où des centaines de milliers de personnes arrivent en même temps pour quelques milliers de places (scénario P-1). Il ne doit jamais vendre deux fois la même place (C-1). Pendant la soutenance, le comité arrêtera un service en pleine vente, et la vente doit continuer (D-2).

Les contraintes de l'équipe pèsent autant que les scénarios :
- nous sommes **deux développeurs**, avec la charge d'un trinôme (partie commune + 4 modules) ;
- chacun doit pouvoir expliquer tout le code en soutenance ;
- tout doit démarrer en une commande sur nos machines, qui exécutent aussi le test de charge (M-2).

Les contextes du domaine n'ont pas tous le même profil :
- **la file d'attente** encaisse le pic : beaucoup de requêtes courtes, sans transaction ;
- **la réservation** exige une cohérence forte et des transactions locales ;
- **le catalogue et les organisateurs** sont surtout lus, avec peu d'écritures ;
- **l'analytique** consomme des événements et ne doit jamais ralentir la vente.

## Décision

Nous adoptons un **monolithe modulaire** pour le cœur métier. Nous en sortons un service séparé **seulement quand un scénario de qualité l'exige** :

| Unité déployable | Contenu | Scénario qui justifie la séparation |
|---|---|---|
| **Cœur** (monolithe modulaire) | Catalogue, Réservation, Organisateurs | Aucun : ces modules partagent des transactions (C-1) |
| **File d'attente** | Entrée, position, admission, jetons | P-1 : elle doit monter en charge seule, au pic |
| **Analytique** | Traitement du flux de ventes, dashboard en direct | D-2 : sa panne ne doit pas toucher la vente |
| **Faux prestataire de paiement** | Simulation d'un prestataire instable | D-1 : il simule un système externe qu'on peut couper |

Dans le Cœur, chaque module est une frontière stricte :
- il expose une API interne et cache son implémentation ;
- il possède son propre schéma PostgreSQL, qu'aucun autre module ne lit directement ;
- ces frontières sont vérifiées en CI par une fonction de fitness (dependency-cruiser, voir ADR 021).

Un module mûr pourra être extrait en service plus tard, comme le recommande le cours (« monolith first »).

## Alternatives écartées

- **Un monolithe unique, sans séparation.** La file d'attente ne pourrait pas monter en charge indépendamment (P-1). Une panne ou une lenteur de l'analytique dégraderait la vente (D-2).
- **Des microservices, un par contexte (6 services).** Pour deux personnes, le coût d'un système distribué n'est pas justifié : réseau, pannes partielles, CI et observabilité par service. La réservation et le catalogue devraient en plus se coordonner par saga, alors qu'une transaction locale suffit. Le risque de construire un monolithe distribué est réel. C'est le piège « architecture par la mode » présenté en cours.
- **Serverless (fonctions à la demande).** Les démarrages à froid tombent exactement au moment du pic (P-1). L'application deviendrait dépendante d'un fournisseur cloud. Le lancement en une commande en local (M-2) deviendrait difficile.

## Conséquences

- \+ Les transactions de réservation restent locales : la cohérence du stock (ADR 003) ne dépend pas d'une coordination réseau.
- \+ La file d'attente se dimensionne seule pour le pic, sans multiplier les instances du Cœur.
- \+ Arrêter l'Analytique ou le faux prestataire n'arrête pas la vente : la démonstration de panne en soutenance est possible.
- \+ Quatre unités au lieu de six : moins de conteneurs, une CI plus simple, et un système que deux personnes peuvent expliquer en entier.
- − Le Cœur se déploie d'un bloc : une modification du Catalogue redéploie aussi la Réservation.
- − Le Cœur monte en charge d'un bloc : on ne peut pas ajouter des instances pour le Catalogue seul. Ce risque est atténué par Meilisearch et le cache, qui absorbent les lectures (ADR 014 et 015).
- − Les frontières entre modules ne tiennent que si la fonction de fitness reste dans la CI et que personne ne la contourne.
