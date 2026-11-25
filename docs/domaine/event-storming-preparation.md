# Event Storming du parcours d'achat — préparation

> Support de l'atelier du jalon 1 (P1 + P2). **Ce n'est pas le résultat de l'atelier** : c'est un
> premier mur, tiré des ADR et du code déjà écrit, à corriger ensemble. Après l'atelier, ce fichier
> est remplacé par le mur final (photo + retranscription), et l'ADR 002 est confirmé ou remplacé
> (dette D-012).

## Légende (couleurs du cours)

| Post-it                        | Notation ici       | Exemple                    |
| ------------------------------ | ------------------ | -------------------------- |
| Événement du domaine (orange)  | **`NomAuPasse`**   | **`PlaceBloquee`**         |
| Commande (bleu)                | _Verbe à l'infinitif_ | _Bloquer une place_     |
| Acteur (jaune)                 | 👤 Nom             | 👤 Acheteur                |
| Politique (violet)             | « Dès que …, … »   | « Dès qu'un paiement est accepté, émettre le billet » |
| Agrégat (jaune pâle)           | [Nom]              | [Siège]                    |
| Système externe (rose)         | ⟦Nom⟧              | ⟦Prestataire de paiement⟧  |
| Vue / lecture (vert)           | 🔎 Nom             | 🔎 Position dans la file   |
| Point chaud (rouge)            | ⚠ Question         | ⚠ Paiement accepté après expiration ? |

## Le mur, dans l'ordre du temps

### 1. Préparer la vente (Organisateurs, Catalogue)

| Acteur          | Commande                      | Agrégat      | Événement               | Politique / remarque                                    |
| --------------- | ----------------------------- | ------------ | ----------------------- | ------------------------------------------------------- |
| 👤 Organisateur | _Créer un événement_          | [Événement]  | **`EvenementCree`**     | Brouillon : invisible du public                          |
| 👤 Organisateur | _Définir le plan de salle et les catégories_ | [Événement] | **`PlanDeSalleDefini`** | Génère les places à vendre (sièges numérotés, fosse) |
| 👤 Organisateur | _Fixer les tarifs_            | [Événement]  | **`TarifModifie`**      | Écrit au journal d'audit (S-4)                           |
| 👤 Organisateur | _Publier l'événement_         | [Événement]  | **`EvenementPublie`**   | « Dès qu'un événement est publié, l'indexer dans le catalogue » (ADR 014) · « … configurer sa file » (remplace D-014) |
| 👤 Organisateur | _Modifier l'événement_        | [Événement]  | **`EvenementModifie`**  | « Dès qu'un événement est modifié, invalider le cache et réindexer » (ADR 015) |

### 2. Avant l'ouverture (File d'attente)

| Acteur      | Commande                       | Agrégat          | Événement                      | Politique / remarque                                  |
| ----------- | ------------------------------ | ---------------- | ------------------------------ | ----------------------------------------------------- |
| 👤 Acheteur | _Se connecter_                 | —                | —                              | ⟦Keycloak⟧ (générique)                                 |
| 👤 Acheteur | _Rechercher un événement_      | —                | —                              | 🔎 Catalogue (Meilisearch) ; au moins une fois avant la file (P-3) |
| 👤 Acheteur | _Entrer dans la file_ (avec preuve de travail) | [File de la vente] | **`AcheteurEntreDansLaFile`** | Avant l'ouverture : rang tiré au sort (ADR 008). Une seule position par compte |
| 👤 Acheteur | _Consulter sa position_        | —                | —                              | 🔎 Position et attente estimée (polling, ADR 009)      |

### 3. Ouverture et admission (File d'attente)

| Acteur        | Commande                        | Agrégat            | Événement             | Politique / remarque                                          |
| ------------- | ------------------------------- | ------------------ | --------------------- | ------------------------------------------------------------- |
| ⏱ Horloge     | —                               | [File de la vente] | **`VenteOuverte`**    | À l'heure fixée par l'organisateur                             |
| ⏱ Worker      | _Admettre les N suivants_       | [File de la vente] | **`AcheteurAdmis`**   | « Chaque seconde, admettre N acheteurs » ; jeton d'accès signé émis (ADR 011) |
| 👤 Exploitant ? | _Régler le débit d'admission_ | [File de la vente] | **`DebitModifie`**    | ⚠ point chaud n° 1                                             |
| —             | —                               | [File de la vente] | **`VenteComplete`**   | « Dès qu'il ne reste plus de place libre ni bloquée, arrêter les admissions » (ADR 008) |

### 4. Réservation et paiement (Réservation)

| Acteur      | Commande                        | Agrégat        | Événement                  | Politique / remarque                                            |
| ----------- | ------------------------------- | -------------- | -------------------------- | --------------------------------------------------------------- |
| 👤 Acheteur | _Bloquer une place_ (avec jeton) | [Siège]       | **`PlaceBloquee`**         | `UPDATE` conditionnel atomique (ADR 003) ; refus immédiat si prise (409) |
| ⏱ Horloge   | —                               | [Siège]        | **`BlocageExpire`**        | Après 10 min sans paiement : la place redevient réservable       |
| 👤 Acheteur | _Payer la réservation_          | [Réservation]  | **`PaiementDemande`**      | Clé d'idempotence ; délai 2 s, disjoncteur (ADR 005)             |
| ⟦Prestataire de paiement⟧ | —                 | [Réservation]  | **`PaiementAccepte`** / **`PaiementRefuse`** | Ou pas de réponse dans le délai ⚠ point chaud n° 3 |
| —           | —                               | [Billet]       | **`BilletEmis`**           | « Dès qu'un paiement est accepté, émettre le billet », dans la même transaction que la place `vendue` (ADR 003) |
| —           | —                               | —              | **`BilletEnvoye`**         | « Dès qu'un billet est émis, l'envoyer par e-mail » (non prioritaire) |

### 5. En continu (Analytique)

| Politique                                                                                     | Vue                                 |
| --------------------------------------------------------------------------------------------- | ----------------------------------- |
| « Dès qu'une place est bloquée, libérée ou vendue, mettre à jour les disponibilités » (ADR 014) | 🔎 Disponibilités par catégorie     |
| « Dès qu'un événement de vente arrive, mettre à jour les agrégats » (ADR 019)                 | 🔎 Dashboard en direct (organisateur) |

## Points chauds à trancher pendant l'atelier

1. ⚠ **Qui règle le débit d'admission ?** Le code actuel le donne à `organisateur-admin` (appel
   provisoire, D-014). Proposition de P1 : l'organisateur fixe l'**ouverture** (dans
   `EvenementPublie`), l'**exploitant** règle le **débit**. C'est un réglage de capacité qui protège
   PostgreSQL, partagé par tous les organisateurs ; l'ADR 008 le fait déjà baisser automatiquement.
2. ⚠ **Combien de places par acheteur ?** Aucune limite n'est encore décidée. Sans limite, un
   acheteur admis peut bloquer une catégorie entière.
3. ⚠ **Paiement sans réponse dans le délai.** Le prestataire a peut-être débité. Le Cœur
   redemande avec la même clé d'idempotence ; mais combien de fois, et que voit l'acheteur ?
4. ⚠ **Paiement accepté après l'expiration du blocage.** La place peut être revendue entre-temps :
   l'ADR 003 refuse alors le billet. L'acheteur a payé sans place : il faut un remboursement, donc
   une compensation, alors que la saga est hors périmètre. Faut-il interdire le paiement quand le
   blocage expire dans moins de 2 s ?
5. ⚠ **Le jeton d'accès (10 min) et le blocage (10 min) se cumulent-ils ?** Un acheteur admis à
   10 h 00 peut-il bloquer à 10 h 09 et payer jusqu'à 10 h 19 ?
6. ⚠ **« Événement » a deux sens** : le spectacle (concert, match) et l'événement du domaine
   (`PlaceBloquee`). À fixer dans le glossaire (arc42 §12).
