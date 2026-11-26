# Scénarios de qualité de la partie P2 — propositions pour P1

> **De** : P2 (entrée, plateforme, exploitation). **Pour** : P1, qui tient l'arbre d'utilité et la
> section 10 de l'arc42 ([`../arc42/10-exigences-qualite.md`](../arc42/10-exigences-qualite.md)).
> **Jalon** : 1. **Statut** : à relire ensemble, puis à reporter dans la section 10 par P1.
>
> Périmètre de P2 (répartition du 25/11/2026) : charge à l'entrée (File d'attente, Traefik),
> disponibilité (Keycloak, File, Redis, observabilité), sécurité (robots, jetons, accès en double),
> exploitation (SLO, alertes). Même format que la section 10 : six parties du cours (source,
> stimulus, artefact, environnement, réponse, mesure), chaque mesure chiffrée et vérifiable.

## 1. Résumé

La section 10 compte déjà 18 scénarios, dont 8 qui touchent la partie P2 (P-1, P-4, E-1, D-2, D-3,
S-1, S-2, O-1). Le minimum du sujet (8 scénarios, dont charge, cohérence, disponibilité et sécurité)
est donc atteint. Ce document **complète** la partie P2 là où elle n'est pas couverte, et propose
quelques précisions sur les scénarios existants.

| Id        | Catégorie (sujet)          | Scénario                                         | Priorité proposée | Nouveau ? |
| --------- | -------------------------- | ------------------------------------------------ | ----------------- | --------- |
| **P-5**   | Charge                     | Suivi de position par 50 000 acheteurs en attente | (H, M)            | Nouveau   |
| **P-6**   | Charge                     | Admission au débit réglé                         | (H, M)            | Nouveau   |
| **C-2**   | Cohérence                  | Aucun acheteur perdu ni admis deux fois          | (H, M)            | Nouveau   |
| **E-2**   | Équité                     | Temps d'attente annoncé fiable                   | (M, L)            | Nouveau   |
| **D-4**   | Disponibilité              | Keycloak arrêté pendant la vente                 | (H, M)            | Nouveau   |
| **D-5**   | Disponibilité              | Une instance de la File d'attente arrêtée        | (H, M)            | Nouveau   |
| **D-6**   | Disponibilité              | Redis redémarré pendant la vente                 | (H, H)            | Nouveau   |
| **D-7**   | Disponibilité              | Observabilité arrêtée pendant la vente           | (M, L)            | Nouveau   |
| **S-5**   | Sécurité (doublons)        | Accès en double avec le même compte              | (H, M)            | Nouveau   |
| **S-6**   | Sécurité (jetons)          | Compte obligatoire pour entrer dans la file      | (H, L)            | Nouveau   |
| **O-2**   | Exploitation               | Alerte sur le SLO pendant une panne              | (M, M)            | Nouveau   |
| P-1, S-1  | Charge, sécurité (robots)  | Précisions proposées (section 4)                 | inchangée         | Existant  |

D-4, D-5 et D-6 répondent à la **question Q3** de la section 10.3 (« le comité peut arrêter un autre
service que l'Analytique ») pour les services de P2. Le cas « une instance du Cœur arrêtée » reste
à P1.

## 2. Ajouts proposés à l'arbre d'utilité

```
├── Cohérence
│   └── File d'attente ............. C-2  0 acheteur perdu ni admis deux fois ..................... (H, M)
├── Performance
│   ├── Suivi de position .......... P-5  p99 < 2 s, ≤ 3 500 req/s pour 50 000 acheteurs ......... (H, M)
│   └── Débit d'admission .......... P-6  débit mesuré à ± 10 % du débit réglé ................... (H, M)
├── Équité
│   └── Attente annoncée ........... E-2  90 % des attentes réelles à ± 25 % de l'estimation ...... (M, L)
├── Disponibilité
│   ├── Identité en panne .......... D-4  Keycloak arrêté 5 min : 0 erreur pour les connectés .... (H, M)
│   ├── Instance de la File ........ D-5  admissions reprises en ≤ 10 s ........................... (H, M)
│   ├── Redis redémarré ............ D-6  ≤ 1 s d'entrées perdues, admissions reprises ≤ 30 s ..... (H, H)
│   └── Observabilité en panne ..... D-7  0 erreur d'achat, p99 dégradé de moins de 10 % ........ (M, L)
├── Sécurité
│   ├── Accès en double ............ S-5  0 compte avec deux positions ou deux jetons ............ (H, M)
│   └── Compte obligatoire ......... S-6  100 % des requêtes sans jeton valide refusées (401) ..... (H, L)
└── Observabilité
    └── Alerte sur SLO ............. O-2  alerte critique en ≤ 2 min après le début d'une panne .. (M, M)
```

D-6 est proposé en **(H, H)** : la perte de Redis arrête la vente (ADR 008, dette D-001), et le
démontrer proprement demande du travail (persistance AOF, reprise du worker, réponses rapides
pendant la coupure).

## 3. Nouveaux scénarios

### P-5 — Charge : suivi de position par les acheteurs en attente

| Partie        | Contenu                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Source        | 50 000 acheteurs virtuels connectés, déjà dans la file                                                       |
| Stimulus      | Interrogent leur position à l'intervalle fixé par le serveur (20 à 30 s loin de l'admission, 2 à 5 s près)   |
| Artefact      | Point d'entrée (Traefik), File d'attente, Redis                                                              |
| Environnement | Vente ouverte, 50 000 acheteurs en attente, admissions en cours (test de charge du sujet)                     |
| Réponse       | Chaque acheteur reçoit sa position, son attente estimée et le délai avant son prochain appel                  |
| Mesure        | Réponse en **< 2 s au p99** ; **0** erreur 5xx ; charge totale **≤ 3 500 requêtes/s**, soit en moyenne au plus un appel toutes les 15 s par acheteur |

Vérifié par : seuils k6 et métrique `http_server_request_duration_seconds` de la route
`/files/:evenementId/position` (Grafana). La charge totale vérifie l'estimation de l'ADR 009.
Décisions : ADR 008, 009, 013.

### P-6 — Charge : admission au débit réglé

| Partie        | Contenu                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Source        | Worker d'admission de la File d'attente                                                         |
| Stimulus      | Admet les premiers de la file chaque seconde ; l'exploitant change le débit pendant la vente    |
| Artefact      | File d'attente (worker d'admission), Redis                                                      |
| Environnement | File de 50 000 acheteurs, débit réglé à 200 acheteurs/s (valeur d'exemple de l'ADR 008)         |
| Réponse       | Le Cœur reçoit un flux d'acheteurs admis lissé au débit réglé, jamais la foule entière          |
| Mesure        | Débit mesuré à **± 10 %** du débit réglé, sur chaque minute ; nouveau débit appliqué en **≤ 2 s** |

Ce scénario conditionne P-2 : la réservation tient son p99 parce que la file ne lui envoie jamais
plus que le débit réglé.

Vérifié par : métrique `ticketrush_file_admissions_total` (taux par minute, Grafana) pendant le test
de charge, avec un changement de débit en cours de test. Décisions : ADR 008.

### C-2 — Cohérence : aucun acheteur perdu ni admis deux fois

| Partie        | Contenu                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| Source        | Worker d'admission, éventuellement deux instances de la File en concurrence                               |
| Stimulus      | Admet les premiers de la file ; une instance est arrêtée au milieu d'un tour d'admission                  |
| Artefact      | File d'attente (worker, verrou), Redis (transaction d'admission)                                          |
| Environnement | Pleine vente, sous charge                                                                                 |
| Réponse       | Un acheteur n'est retiré de la file que si son admission est enregistrée dans la même transaction         |
| Mesure        | À la fin de la vente : acheteurs entrés = en attente + admis, **0** écart ; **0** acheteur avec deux jetons d'admission pour la même vente |

Vérifié par : comptage dans Redis à la fin du test de charge (positions restantes, admissions
enregistrées) comparé au nombre d'entrées réussies vu par k6. Décisions : ADR 008, 011.

### E-2 — Équité : temps d'attente annoncé fiable

| Partie        | Contenu                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Source        | Acheteur en attente                                                                                 |
| Stimulus      | Lit le temps d'attente estimé affiché par la salle d'attente                                        |
| Artefact      | File d'attente (estimation = position ÷ débit d'admission)                                          |
| Environnement | Débit d'admission constant, test de charge                                                          |
| Réponse       | L'estimation affichée correspond à l'attente réelle                                                 |
| Mesure        | Pour **90 %** des acheteurs, attente réelle à **± 25 %** de l'estimation lue à l'entrée (proposé)   |

L'ADR 008 présente l'attente comme une **estimation** : elle devient fausse si le débit change. La
mesure ne vaut donc qu'à débit constant.

Vérifié par : k6 enregistre l'estimation reçue à l'entrée et l'heure réelle de l'admission.
Décisions : ADR 008, 009.

### D-4 — Disponibilité : Keycloak arrêté pendant la vente

| Partie        | Contenu                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Source        | Le comité (panne injectée)                                                                                  |
| Stimulus      | Arrête Keycloak pendant **5 minutes** en pleine vente (`docker compose stop keycloak`), puis le relance     |
| Artefact      | File d'attente et Cœur (vérification locale des jetons), Keycloak                                           |
| Environnement | Pleine vente ; les acheteurs se sont connectés avant l'ouverture (ADR 010)                                  |
| Réponse       | Les acheteurs déjà connectés continuent : entrée, position, réservation. Seules les nouvelles connexions échouent, avec un message clair |
| Mesure        | **0** erreur 5xx et **0** refus 401 injustifié pour les acheteurs connectés pendant la coupure ; nouvelles connexions de nouveau possibles **≤ 1 min** après la relance |

**Point à vérifier** : la File garde les clés publiques de Keycloak en cache (`createRemoteJWKSet`
de `jose`). Par défaut, ce cache est renouvelé au bout de 10 minutes : au-delà, une coupure plus
longue pourrait faire échouer les vérifications. D'où la durée de 5 minutes ; à régler
(`cacheMaxAge`) ou à documenter.

Vérifié par : test de résilience pendant le test k6, avec des jetons obtenus avant la coupure.
Décisions : ADR 010, 011.

### D-5 — Disponibilité : une instance de la File d'attente arrêtée

| Partie        | Contenu                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Source        | Le comité (panne injectée)                                                                           |
| Stimulus      | Arrête l'une des instances de la File, dont celle qui détient le verrou d'admission                  |
| Artefact      | File d'attente (instances sans état, verrou du worker), Traefik                                      |
| Environnement | Pleine vente, File lancée en **2 instances** ou plus (`--scale file-attente=2`, secrets fournis : dette D-015) |
| Réponse       | Traefik envoie les requêtes à l'instance restante ; elle reprend le verrou et les admissions          |
| Mesure        | Admissions reprises en **≤ 10 s** ; **0** position perdue ; **≤ 0,1 %** de requêtes en erreur pendant la bascule (budget de D-3) |

Vérifié par : test de résilience (`docker compose stop` d'une instance) et métrique
`ticketrush_file_admissions_total`. Le seuil de 10 s est celui de la dette D-002. Décisions : ADR
008, 009, 013.

### D-6 — Disponibilité : Redis redémarré pendant la vente

| Partie        | Contenu                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Source        | Le comité (panne injectée)                                                                                  |
| Stimulus      | Redémarre Redis en pleine vente (`docker compose restart redis`)                                            |
| Artefact      | Redis (persistance AOF), File d'attente                                                                     |
| Environnement | Pleine vente, file non vide                                                                                 |
| Réponse       | Pendant la coupure, la File répond vite par une erreur claire au lieu de bloquer ; au retour, la file est restaurée depuis l'AOF et les admissions reprennent |
| Mesure        | Entrées perdues limitées à **≤ 1 s** avant la coupure (AOF chaque seconde) ; **100 %** des positions plus anciennes conservées, dans le même ordre ; réponse d'erreur en **< 1 s** pendant la coupure ; admissions reprises **≤ 30 s** après le retour de Redis |

Redis est un point de défaillance unique en local (dette D-001) : ce scénario mesure ce que la
persistance protège, pas une haute disponibilité.

Vérifié par : test de résilience, positions relevées avant et après le redémarrage. Décisions : ADR
008.

### D-7 — Disponibilité : observabilité arrêtée pendant la vente

| Partie        | Contenu                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Source        | Panne de l'outillage d'exploitation                                                              |
| Stimulus      | Le conteneur d'observabilité (Collector, Prometheus, Tempo, Loki, Grafana) s'arrête              |
| Artefact      | Tous les services instrumentés (SDK OpenTelemetry)                                               |
| Environnement | Pleine vente, sous charge                                                                        |
| Réponse       | La vente continue ; la télémétrie de la période est abandonnée, jamais mise en attente           |
| Mesure        | **0** erreur côté achat ; p99 de l'entrée dans la file dégradé de **moins de 10 %**              |

Déjà observé hors charge le 25/11/2026 : observabilité arrêtée, 10 requêtes sur 10 servies, aucune
erreur des SDK. Reste à le mesurer sous charge.

Vérifié par : test de résilience (`docker compose stop observabilite`) et seuils k6. Décisions :
ADR 017.

### S-5 — Sécurité : accès en double avec le même compte

| Partie        | Contenu                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Source        | Acheteur, ou script qui partage un compte                                                                        |
| Stimulus      | Entre dans la file depuis **10 onglets ou appareils en même temps**, puis redemande l'entrée une fois admis      |
| Artefact      | File d'attente (entrée idempotente, admission), Redis                                                            |
| Environnement | Avant et pendant l'ouverture                                                                                     |
| Réponse       | Une seule position par compte ; toutes les sessions voient la même position, puis le même jeton d'admission      |
| Mesure        | **0** compte avec deux positions dans une même file ; **0** compte avec deux jetons d'admission actifs pour une même vente ; **100 %** des entrées simultanées renvoient la même position |

Aujourd'hui couvert en une ligne par E-1 (« 0 compte avec deux positions ») : le sujet cite les
**accès en double** comme une exigence du module File d'attente, d'où un scénario à part. Le rejeu
d'un jeton **déjà utilisé** pour réserver reste dans S-2.

Vérifié par : test d'intégration (entrées concurrentes, même compte) et requête Redis à la fin du
test de charge. Décisions : ADR 008, 011, 012.

### S-6 — Sécurité : compte obligatoire pour entrer dans la file

| Partie        | Contenu                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Source        | Client sans compte, ou avec un jeton invalide                                                                     |
| Stimulus      | Demande un défi, l'entrée ou sa position sans jeton Keycloak, avec un jeton expiré, d'une autre audience, ou signé par une autre clé |
| Artefact      | File d'attente (vérification locale du jeton Keycloak)                                                            |
| Environnement | Avant et pendant l'ouverture                                                                                      |
| Réponse       | Requête refusée avant tout accès à Redis                                                                          |
| Mesure        | **100 %** des requêtes refusées en **401** ; **0** position créée ; vérification locale en **< 5 ms**, sans appel à Keycloak |

C'est la troisième couche anti-robots de l'ADR 012 (« compte obligatoire »). Déjà observé le
25/11/2026 : `defi` et `position` sans jeton renvoient 401.

Vérifié par : tests d'intégration de la File (un cas par type de jeton invalide). Décisions : ADR
010, 012.

### O-2 — Exploitation : alerte sur le SLO pendant une panne

| Partie        | Contenu                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Source        | Le comité (panne injectée)                                                                               |
| Stimulus      | Une panne fait échouer les requêtes du parcours d'achat (par exemple la File d'attente arrêtée)          |
| Artefact      | Prometheus (règles SLO), Grafana Alerting                                                                |
| Environnement | Pleine vente                                                                                             |
| Réponse       | L'alerte critique de vitesse de consommation du budget se déclenche, puis se résout après le retour      |
| Mesure        | Alerte déclenchée en **≤ 2 min** après le début de la panne ; résolue en **≤ 5 min** après le retour ; **0** alerte critique pendant une vente sans panne |

Les fenêtres viennent de l'ADR 018 (critique : consommation 14 fois trop rapide sur 5 min **et**
sur 1 min). « 0 alerte sans panne » mesure l'absence de fausses alertes.

Vérifié par : démonstration chronométrée (panne injectée pendant le test k6). Décisions : ADR 017,
018.

## 4. Précisions proposées sur les scénarios existants

- **P-1 et P-5, test de charge et limitation de débit.** Traefik limite l'entrée dans la file à
  **2 requêtes/s par adresse IP** (rafale de 5, ADR 012), et le reste de `/api/file`, dont le suivi
  de position, à **20 requêtes/s par adresse IP** (rafale de 40). Un test k6 lancé depuis une seule
  machine sera donc presque entièrement refusé (429), et P-1 comme P-5 ne seront pas mesurables
  tels quels. À décider
  ensemble pour le jalon 3 : limite relevée par une variable d'environnement pendant le test (à
  inscrire au registre de dette, comme ALTCHA en D-010), ou k6 réparti sur plusieurs adresses.
- **S-1, chiffrer la limite de débit.** Ajouter à la mesure : au-delà de **2 requêtes/s par adresse
  IP** (rafale de 5) sur l'entrée et le défi, **100 %** des requêtes excédentaires reçoivent **429**
  avant d'atteindre la File d'attente. Ce sont les valeurs du Compose.
- **E-1, accès en double.** Si S-5 est retenu, la mesure « 0 compte avec deux positions » peut y
  être déplacée, et E-1 se concentrer sur l'ordre d'admission.
- **O-1, artefact.** Le tableau de bord versionné « TicketRush — Services (RED) » et la trace
  Traefik → File d'attente existent déjà (ADR 017) : il reste à chronométrer la recherche d'une
  trace lente pendant le test de charge.

## 5. Questions pour P1

1. Les identifiants **P-5, P-6, C-2, E-2, D-4 à D-7, S-5, S-6, O-2** te conviennent-ils, ou
   préfères-tu une autre numérotation ?
2. Retiens-tu les **11 scénarios**, ou seulement une partie (par exemple ceux en (H, ·)) ? Tous sont
   vérifiables avec le test de charge et les métriques déjà en place, sauf E-2 et O-2, qui
   demandent un peu d'outillage (relevé de l'estimation dans k6, règles d'alerte).
3. Les priorités proposées pour l'arbre d'utilité sont-elles d'accord avec ta vision des
   scénarios (H, H) qui pilotent l'architecture ?
