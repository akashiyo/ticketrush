# TicketRush — Registre de la dette technique

> Exigé par le sujet (partie Gouvernance) et décrit dans l'ADR 021.
> Chaque dette est classée selon le **quadrant de Martin Fowler** vu en cours :
> **prudente ou imprudente**, **délibérée ou involontaire**.
> La dette prudente et délibérée est un choix d'architecture légitime : elle est assumée, chiffrée et rattachée à un ADR.

## Comment tenir ce registre

- **Toute dette délibérée** est inscrite **au moment de la décision**, dans le même commit que l'ADR ou le code concerné.
- **Toute dette découverte** (involontaire) est inscrite dès qu'elle est constatée, avec l'incident ou le test qui l'a révélée.
- **Le coût** se mesure si possible : temps perdu, incident, SLO dégradé, risque en soutenance.
- **Une dette remboursée** n'est pas supprimée : on passe son statut à « Remboursée », avec la date et le commit ou l'ADR.
- **Revue du registre** à chaque jalon, par les deux membres du binôme.

## Registre

| Id | Dette | Type (Fowler) | ADR | Coût si non remboursée | Remboursement prévu | Statut |
|---|---|---|---|---|---|---|
| D-001 | **Redis en instance unique**, sans haute disponibilité. Il porte la file d'attente, l'anti-rejeu des jetons, le cache et les agrégats | Prudente, délibérée | 008, 011, 015 | Une panne de Redis arrête les admissions et la vérification des jetons. La file en cours est perdue si la persistance AOF ne suffit pas | Redis Sentinel (3 nœuds) dans la cible de production. Hors périmètre du Compose | Ouverte |
| D-002 | **Worker d'admission unique**, protégé par un verrou | Prudente, délibérée | 008 | Les admissions s'arrêtent quelques secondes si le worker tombe, le temps qu'une autre instance reprenne le verrou | Mesurer la durée de reprise au test de résilience. Accepter si elle reste sous 10 s | Ouverte |
| D-003 | **PostgreSQL en instance unique**, sans réplique de secours | Prudente, délibérée | 004 | Un arrêt de PostgreSQL arrête toute la réservation et le back-office | Réplique de secours et bascule automatique dans la cible de production | Ouverte |
| D-004 | **Redpanda sur un seul nœud** | Prudente, délibérée | 006 | Les flux asynchrones s'arrêtent. La vente continue, et les événements s'accumulent dans l'Outbox jusqu'au retour du broker | Réplication sur 3 nœuds dans la cible de production | Ouverte |
| D-005 | **Analytique en instance unique** | Prudente, délibérée | 019 | Le dashboard des organisateurs s'arrête pendant la panne, sans effet sur la vente. Pas de montée en charge horizontale | Répartir les partitions entre plusieurs instances si la charge l'exige | Ouverte |
| D-006 | **Limitation de débit Traefik comptée par instance**, en mémoire | Prudente, délibérée | 013 | Avec plusieurs instances de Traefik, un client peut dépasser la limite globale. Les autres couches anti-robots compensent (ADR 012) | Limitation de débit partagée dans un stockage commun si plusieurs instances de Traefik sont déployées | Ouverte |
| D-007 | **Test de charge réduit dans la CI** (environ 2 000 acheteurs pour 200 places) | Prudente, délibérée | 021 | Une régression qui n'apparaît qu'à grande échelle passe la CI. Elle est détectée au test complet avant le jalon suivant | Test complet planifié avant chaque jalon, rapport versionné dans `docs/rapports/` | Ouverte |
| D-008 | **Image d'observabilité tout-en-un** (`grafana/otel-lgtm`) en local | Prudente, délibérée | 017 | Elle ne reflète pas une production : pas de rétention longue, pas de haute disponibilité | Outils séparés dans la cible de production (vue de déploiement) | Ouverte |
| D-009 | **Docker Compose sur une seule machine** | Prudente, délibérée | 022 | La tolérance aux pannes démontrée couvre l'arrêt de conteneurs, pas la perte d'une machine ni d'une zone | Bonus Kubernetes (k3d + HPA) ; plusieurs zones dans la cible de production | Ouverte |
| D-010 | **Défis ALTCHA désactivés par un mode de test** pendant le test de charge, si k6 ne les résout pas | Prudente, délibérée | 012 | Le coût réel de la vérification de preuve de travail n'est pas mesuré sous charge | Mesurer séparément le coût de vérification, ou faire résoudre les défis par k6. Le mode existe : `ALTCHA_ACTIF=false` (avertissement au démarrage) | Ouverte |
| D-011 | **Objectifs des SLO fixés sans mesure préalable** | Prudente, délibérée | 018 | Des alertes trop sensibles ou trop laxistes pendant la démo | Recalibrer les SLO après le premier test de charge (jalon 3) | Ouverte |
| D-012 | **Découpage en contextes antérieur à l'Event Storming** | Prudente, délibérée | 002 | Des frontières de modules à revoir, donc du code à déplacer | Confirmer ou remplacer l'ADR 002 après l'atelier du jalon 1 | Ouverte |
| D-013 | **Faux prestataire de paiement sans persistance** : paiements et clés d'idempotence gardés en mémoire | Prudente, délibérée | 005 | Après un redémarrage du faux paiement, une nouvelle tentative du Cœur avec une ancienne clé crée un second paiement simulé. Sans effet sur le stock : seule la réservation dans PostgreSQL fait foi (ADR 003) | Accepté tel quel : c'est un prestataire simulé. Le Cœur doit tolérer un paiement inconnu après redémarrage | Ouverte |
| D-014 | **Configuration de la vente dans la File par un appel provisoire** (`PUT /files/{id}/vente`), sans vérifier que l'organisateur possède l'événement | Prudente, délibérée | 008, 016 | Un organisateur administrateur pourrait régler l'ouverture ou le débit de la vente d'un autre (scénario S-3) | Remplacer par la lecture de l'événement `EvenementPublie` du Cœur, une fois les contrats v1 écrits avec P1 | Ouverte |
| D-015 | **Secrets de la File générés au démarrage** : clé de signature des jetons d'admission (`FILE_JETON_CLE_PRIVEE_PEM`) et secret des défis ALTCHA (`ALTCHA_SECRET`), s'ils sont vides | Prudente, délibérée | 011, 012 | Après un redémarrage de la File, les jetons et les défis émis avant deviennent invalides ; impossible de lancer plusieurs instances | Fournir les deux secrets par variables d'environnement avant de lancer plusieurs instances (test de charge) | Ouverte |
| D-016 | **Plan de salle lu dans PostgreSQL derrière un cache de 2 s en mémoire** (`GET /evenements/{id}/plan`), au lieu de la projection prévue par l'ADR 015 | Prudente, délibérée | 014, 015 | Au pic, chaque instance du Cœur lit la base qui protège le stock jusqu'à une fois toutes les 2 s par vente ; les disponibilités affichées peuvent avoir 2 s de retard (sans effet sur la cohérence : le blocage reste atomique) | Lire les disponibilités dans la projection du Catalogue (ADR 014) quand elle portera les places ; mesurer la charge réelle au test de charge | Ouverte |
| D-017 | **Une seule place par réservation** | Prudente, délibérée | 003 | Un acheteur qui veut deux places passe deux fois par le blocage et le paiement ; aucune limite de places par acheteur n'est appliquée (point chaud n° 2 de l'Event Storming) | Décider la limite par acheteur à l'Event Storming, puis bloquer plusieurs places dans la même transaction | Ouverte |
| D-018 | **Réservations « à rembourser » sans remboursement automatique** : paiement accepté mais place perdue | Prudente, délibérée | 003, 005 | L'acheteur est débité sans billet tant qu'un remboursement n'est pas fait à la main. Rare : le paiement est refusé quand le blocage expire dans moins de 15 s | Saga de compensation (remboursement auprès du prestataire), hors du périmètre retenu ; compter ces cas au test de charge | Ouverte |
| D-019 | **Anti-rejeu du jeton d'accès (`jti`) pas encore appliqué par le Cœur** | Prudente, délibérée | 011 | Un jeton d'accès valide peut servir à plusieurs blocages pendant ses 10 minutes (scénario S-2 partiellement couvert) | `SET jti:<jti> NX` dans Redis au premier blocage réussi, une fois la règle validée avec P2 | Ouverte |
| D-020 | **Lignes publiées de l'Outbox jamais purgées** | Prudente, délibérée | 007 | La table `outbox` grossit d'environ 3 lignes par place vendue ; sans effet sur une vente, gênant sur la durée | Tâche nocturne qui supprime les lignes publiées depuis plus de 7 jours (rétention de Redpanda) | Ouverte |

## Dette remboursée

*(Aucune pour l'instant.)*
