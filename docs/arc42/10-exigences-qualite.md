# 10. Exigences de qualité

> Chaque scénario suit le format en six parties du cours (source, stimulus, artefact, environnement,
> réponse, mesure) et devient un **critère d'acceptation** de l'architecture. Les identifiants sont
> ceux cités par les ADR.
>
> Les valeurs marquées **(proposé)** sont nouvelles par rapport à la liste provisoire de
> `docs/adr/liste-adr.md` : à valider à deux.

## 10.1 Arbre d'utilité

Priorité = (importance métier, difficulté technique), H / M / L. Les scénarios **(H, H)** pilotent
l'architecture.

```
Utilité
├── Cohérence
│   └── Stock de places ............ C-1  zéro survente, 50 000 acheteurs / 5 000 places ....... (H, H)
├── Performance
│   ├── Entrée dans la file ........ P-1  position reçue en < 2 s au p99 à l'ouverture .......... (H, H)
│   ├── Réservation ................ P-2  blocage confirmé ou refusé en < 500 ms au p99 ......... (H, M)
│   └── Recherche .................. P-3  < 300 ms au p99, sans dégrader la réservation ......... (M, M)
├── Équité
│   └── Ordre d'admission .......... E-1  100 % des admissions dans l'ordre, 1 position/compte .. (H, M)
├── Disponibilité
│   ├── Prestataire en panne ....... D-1  la vente continue, 0 billet sans paiement ............ (H, H)
│   └── Service arrêté ............. D-2  Analytique coupée : 0 erreur d'achat, rattrapage < 5 min (H, M)
├── Sécurité
│   ├── Robots ..................... S-1  100 % des clients sans preuve de travail refusés ....... (H, M)
│   ├── Jetons d'accès ............. S-2  100 % des jetons falsifiés, expirés, rejoués refusés .... (H, M)
│   ├── Isolation des organisateurs  S-3  0 ligne d'un autre organisateur, testé en CI .......... (H, M)
│   └── Traçabilité ................ S-4  100 % des modifications du back-office auditées ....... (M, L)
├── Observabilité
│   └── Diagnostic ................. O-1  trace complète d'une réservation lente en < 1 min ..... (M, M)
└── Maintenabilité
    ├── Extension .................. M-1  nouveau consommateur : 0 modification du producteur ... (M, L)
    ├── Démarrage .................. M-2  plateforme complète en 1 commande, < 5 min ............ (M, L)
    └── Frontières des modules ..... M-3  import interdit entre modules : CI rouge à 100 % ....... (M, L)
```

## 10.2 Scénarios de qualité

### C-1 — Cohérence : zéro survente

| Partie        | Contenu                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Source        | 50 000 acheteurs virtuels admis (test k6)                                                                |
| Stimulus      | Tentent en concurrence de bloquer puis de payer des places, souvent les mêmes                            |
| Artefact      | Cœur, module Réservation, et la base PostgreSQL                                                          |
| Environnement | Ouverture d'une vente de 5 000 places, pic de charge, plusieurs instances du Cœur                         |
| Réponse       | Chaque place est attribuée à un seul acheteur ; les autres reçoivent immédiatement « place déjà prise » (409) |
| Mesure        | **0** couple (événement, place) avec plus d'un billet ; **≤ 5 000** billets émis                          |

Vérifié par : les deux requêtes SQL de l'ADR 003 lancées automatiquement à la fin du test k6, et le
contrôle continu pendant la vente (invariant, ADR 018). Décisions : ADR 003, 004, 008.

### P-1 — Performance : entrée dans la file à l'ouverture

| Partie        | Contenu                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| Source        | Acheteurs connectés                                                                |
| Stimulus      | Demandent leur entrée dans la file dans la première minute de l'ouverture          |
| Artefact      | Point d'entrée (Traefik) et service File d'attente                                 |
| Environnement | Ouverture de la vente : 200 000 connexions dans la première minute                 |
| Réponse       | Chaque acheteur reçoit sa position et un temps d'attente estimé                    |
| Mesure        | Réponse en **< 2 s au p99**, **0** erreur 5xx                                      |

Vérifié par : seuils k6 ; SLO « Entrée dans la file » (ADR 018). Décisions : ADR 001, 008, 009, 013.
Voir la question ouverte Q1 sur le volume vérifiable.

### P-2 — Performance : réservation au pic

| Partie        | Contenu                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| Source        | Acheteur admis, porteur d'un jeton d'accès valide                                           |
| Stimulus      | Demande le blocage d'une place                                                              |
| Artefact      | Cœur, module Réservation                                                                    |
| Environnement | Pic de la vente, au débit d'admission réglé par la file (par exemple 200 acheteurs/s)       |
| Réponse       | Place bloquée 10 minutes pour lui, ou refus immédiat si elle est prise                      |
| Mesure        | Réponse (obtenue ou refusée) en **< 500 ms au p99**, **0** erreur 5xx                       |

Vérifié par : seuils k6 ; SLO « Réservation » (ADR 018). Décisions : ADR 003, 008.

### P-3 — Performance : recherche pendant la vente

| Partie        | Contenu                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| Source        | Visiteurs du catalogue                                                                      |
| Stimulus      | Recherchent par date, lieu ou artiste                                                       |
| Artefact      | Catalogue : modèle de lecture (Meilisearch) et cache                                        |
| Environnement | Pendant une vente au pic : 200 000 recherches par minute                                   |
| Réponse       | Résultats renvoyés sans solliciter la base qui protège le stock                             |
| Mesure        | Recherche en **< 300 ms au p99** ; p99 de la réservation dégradé de **moins de 10 %**        |

Vérifié par : test k6 avec et sans trafic de recherche ; SLO « Recherche » (ADR 018).
Décisions : ADR 014, 015.

### E-1 — Équité : ordre d'admission

| Partie        | Contenu                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Source        | Acheteurs arrivés avant l'ouverture (salle d'attente) et après                                                   |
| Stimulus      | La vente ouvre ; un même acheteur tente d'entrer depuis plusieurs onglets ou appareils                           |
| Artefact      | Service File d'attente (worker d'admission)                                                                      |
| Environnement | Ouverture de la vente                                                                                            |
| Réponse       | Ordre tiré au sort pour ceux arrivés avant l'ouverture, ordre d'arrivée ensuite ; une seule position par compte  |
| Mesure        | **100 %** des admissions dans l'ordre de la file ; **0** compte avec deux positions                               |

Vérifié par : comparaison du journal des admissions avec les scores de la file à la fin du test.
Décisions : ADR 008, 012.

### D-1 — Disponibilité : le prestataire de paiement tombe

| Partie        | Contenu                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Source        | Le comité (panne injectée)                                                                                                               |
| Stimulus      | Le prestataire de paiement ne répond plus, ou répond au-delà de 2 s                                                                     |
| Artefact      | Cœur (adaptateur de paiement) et prestataire                                                                                             |
| Environnement | Pleine vente, sous charge                                                                                                                |
| Réponse       | Le disjoncteur s'ouvre : le Cœur répond « paiement indisponible » ; la file et la réservation continuent ; les places non payées sont libérées à l'expiration du blocage |
| Mesure        | **0** billet émis sans paiement accepté ; **100 %** des places bloquées non payées de nouveau réservables **≤ 10 min** ; **0** erreur 5xx sur l'entrée dans la file ; disjoncteur ouvert : réponse en **< 100 ms** **(proposé)** |

Vérifié par : test de résilience (prestataire coupé pendant le test k6) et requête SQL billets / paiements
acceptés. Décisions : ADR 003, 005.

### D-2 — Disponibilité : un service est arrêté

| Partie        | Contenu                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Source        | Le comité                                                                                                |
| Stimulus      | Arrête le service Analytique en pleine vente, puis le relance                                            |
| Artefact      | Analytique, Outbox du Cœur, Redpanda                                                                     |
| Environnement | Pleine vente, sous charge                                                                                |
| Réponse       | La vente continue ; les événements attendent dans Redpanda ; l'Analytique les rattrape à son redémarrage |
| Mesure        | **0** erreur côté achat ; **0** événement perdu ; rattrapage **< 5 min** après le redémarrage             |

Vérifié par : comparaison du nombre de `BilletEmis` dans l'Outbox et dans les agrégats de l'Analytique.
Décisions : ADR 001, 005, 006, 007, 019.

### S-1 — Sécurité : robots

| Partie        | Contenu                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| Source        | Client automatisé                                                                 |
| Stimulus      | Demande l'entrée dans la file sans preuve de travail valide, ou au-delà du débit  |
| Artefact      | Point d'entrée (Traefik) et service File d'attente                                |
| Environnement | Avant et pendant l'ouverture                                                      |
| Réponse       | Requête refusée avant toute création de position                                  |
| Mesure        | **100 %** des requêtes refusées ; **0** position créée                            |

Vérifié par : test automatisé avec défi absent, invalide ou réutilisé. Décisions : ADR 012, 013.

### S-2 — Sécurité : jetons d'accès à la vente

| Partie        | Contenu                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Source        | Attaquant ou acheteur malhonnête                                                                     |
| Stimulus      | Présente au Cœur un jeton falsifié, expiré, déjà utilisé, ou émis pour un autre acheteur             |
| Artefact      | Cœur (vérification du jeton d'admission)                                                             |
| Environnement | Pic de la vente                                                                                      |
| Réponse       | Réservation refusée                                                                                  |
| Mesure        | **100 %** des jetons refusés ; signature vérifiée en **< 5 ms** sans appel réseau ; rejeu détecté par **un seul** appel Redis |

Vérifié par : tests unitaires et d'intégration sur chaque cas. Décisions : ADR 011.

### S-3 — Sécurité : isolation des organisateurs

| Partie        | Contenu                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| Source        | Organisateur A, authentifié                                                           |
| Stimulus      | Tente de lire, modifier ou supprimer des événements, tarifs ou ventes de l'organisateur B |
| Artefact      | Cœur, module Organisateurs, et PostgreSQL (Row-Level Security)                        |
| Environnement | Fonctionnement normal                                                                 |
| Réponse       | Aucune donnée de B n'est lue ni modifiée                                              |
| Mesure        | **0** ligne lue, **0** ligne modifiée                                                 |

Vérifié par : test automatique en CI. Décisions : ADR 010, 016.

### S-4 — Sécurité : traçabilité du back-office **(proposé)**

| Partie        | Contenu                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| Source        | Gestionnaire d'un organisateur                                                             |
| Stimulus      | Modifie un tarif ou un événement                                                           |
| Artefact      | Cœur, module Organisateurs (journal d'audit)                                               |
| Environnement | Fonctionnement normal                                                                      |
| Réponse       | La modification est enregistrée dans le journal, dans la même transaction                   |
| Mesure        | **100 %** des modifications ont leur ligne d'audit (qui, quoi, quand, avant, après) ; **0** modification ou suppression possible du journal par le rôle applicatif |

Vérifié par : test automatique en CI. Décisions : ADR 016.

### O-1 — Observabilité : diagnostiquer une réservation lente

| Partie        | Contenu                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Source        | Exploitant                                                                                      |
| Stimulus      | Une réservation lente apparaît sur le tableau de bord de la vente                               |
| Artefact      | Toute la chaîne : point d'entrée, Cœur, PostgreSQL, prestataire de paiement, Outbox, Redpanda   |
| Environnement | Pic de la vente                                                                                 |
| Réponse       | L'exploitant retrouve la trace complète et l'étape qui ralentit                                 |
| Mesure        | Trace retrouvée dans Grafana en **< 1 min**                                                     |

Vérifié par : démonstration chronométrée pendant le test de charge. Décisions : ADR 017.

### M-1 — Évolutivité : nouveau consommateur d'événements

| Partie        | Contenu                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| Source        | Développeur                                                                 |
| Stimulus      | Ajoute un consommateur des événements de vente (par exemple, un envoi d'e-mail) |
| Artefact      | Producteurs d'événements (Cœur)                                             |
| Environnement | Développement                                                               |
| Réponse       | Le consommateur s'abonne au topic existant                                  |
| Mesure        | **0** ligne modifiée dans le producteur                                     |

Vérifié par : le diff de la pull request. Décisions : ADR 005, 006.

### M-2 — Maintenabilité : démarrage en une commande

| Partie        | Contenu                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| Source        | Membre de l'équipe ou comité                                             |
| Stimulus      | Clone le dépôt et lance la plateforme                                    |
| Artefact      | Dépôt, Docker Compose                                                    |
| Environnement | Machine avec Docker, sans autre préparation                              |
| Réponse       | Toute la plateforme démarre, migrations et données de démo comprises     |
| Mesure        | **1** commande ; tous les conteneurs `healthy` en **< 5 min**             |

Vérifié par : un démarrage chronométré sur une machine propre avant chaque jalon. Décisions : ADR 022.

### M-3 — Maintenabilité : frontières des modules du Cœur **(proposé)**

| Partie        | Contenu                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Source        | Développeur                                                                                                  |
| Stimulus      | Importe une classe interne d'un autre module, ou fait dépendre le domaine de l'infrastructure                |
| Artefact      | Code du Cœur                                                                                                 |
| Environnement | Pull request                                                                                                 |
| Réponse       | La CI refuse la modification                                                                                 |
| Mesure        | **100 %** des imports interdits font échouer la CI (fonction de fitness dependency-cruiser)                   |

Vérifié par : une pull request de test avec un import interdit volontaire. Décisions : ADR 001, 002, 021.

## 10.3 Questions ouvertes

- **Q1 — Volumes vérifiables.** P-1 (200 000 connexions par minute) et P-3 (200 000 recherches par
  minute) dépassent le test de charge exigé (50 000 acheteurs) et probablement nos machines. Soit
  on garde 200 000 comme cible de production et on démontre 50 000, soit on ramène l'environnement
  du scénario au volume du test. À trancher avec P2 (P-1 est sur sa piste).
- **Q2 — Objectif de P-1.** Le scénario dit « < 2 s au p99 » (99 %) ; l'ADR 018 fixe le SLO à
  99,5 % sous 2 s. Aligner l'un sur l'autre.
- **Q3 — Autres pannes en soutenance.** Le comité peut arrêter un autre service que l'Analytique
  (le Cœur, la File d'attente, Redis). Faut-il un scénario par cas, par exemple « une instance du
  Cœur arrêtée : la vente continue sur l'autre » ?
- **Q4 — Remise du billet.** Le billet est-il seulement affiché dans l'application, ou aussi envoyé
  par e-mail ? Dans le second cas, un service d'e-mail apparaît dans le contexte C4.
