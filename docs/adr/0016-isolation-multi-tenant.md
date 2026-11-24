# ADR 016 — Isolation multi-tenant des organisateurs : Row-Level Security PostgreSQL

Statut : Accepté (2026-11-24) · Responsable : P1

## Contexte

Le module Organisateurs exige que **chaque organisateur gère ses événements, ses tarifs et ses ventes**, avec :
- une **isolation stricte des données** entre organisateurs ;
- des **rôles** ;
- un **journal d'audit**.

Chaque organisateur dispose de son propre dashboard de gestion, dans la section `/organisateur` de l'application.

Des organisateurs concurrents utilisent la même plateforme : une fuite des ventes ou des tarifs de l'un vers l'autre serait grave.

Scénario **S-3** : l'organisateur A interroge les données de B → 0 ligne renvoyée, vérifié par un test en CI.

Le risque principal n'est pas une attaque sophistiquée : c'est **un `WHERE organisation_id = …` oublié dans une requête**. Si l'isolation ne repose que sur le code, un seul oubli suffit à provoquer une fuite.

## Décision

**L'isolation est garantie par PostgreSQL lui-même, grâce à la Row-Level Security (RLS).**

**1. Chaque table sensible porte l'organisation**, et une politique de sécurité filtre automatiquement les lignes :

```sql
ALTER TABLE organisateurs.tarif ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisateurs.tarif FORCE ROW LEVEL SECURITY;

CREATE POLICY isolation_organisation ON organisateurs.tarif
  USING      (organisation_id = current_setting('app.organisation_id')::uuid)
  WITH CHECK (organisation_id = current_setting('app.organisation_id')::uuid);
```

La même politique s'applique aux événements de l'organisateur et à ses vues de ventes.

**2. L'organisation vient du jeton, jamais d'un paramètre.** Au début de chaque transaction du back-office, le Cœur lit l'identifiant d'organisation dans le jeton Keycloak vérifié (ADR 010) et exécute :

```sql
SET LOCAL app.organisation_id = '<identifiant tiré du jeton>';
```

`SET LOCAL` limite le réglage à la transaction : une connexion réutilisée par le pool ne garde jamais l'organisation de la requête précédente.

**3. Le rôle PostgreSQL de l'application** n'est ni propriétaire des tables ni autorisé à contourner la RLS. Même une requête mal écrite ne voit que les lignes de l'organisation courante.

**4. Les rôles applicatifs** (`organisateur-admin`, `organisateur-gestionnaire`, `organisateur-lecteur`) viennent de Keycloak. Le Cœur vérifie le rôle avant chaque action : seul un gestionnaire ou un administrateur peut modifier un tarif.

**5. Le journal d'audit** est une table `organisateurs.audit` en **ajout seul**. Le rôle applicatif a le droit d'y insérer, mais ni de modifier ni de supprimer. Chaque ligne enregistre qui a fait quoi, quand, sur quel objet, et la valeur avant et après. L'écriture se fait dans la même transaction que la modification : aucune action sans trace.

**6. Le test de CI (S-3)** crée deux organisations, se connecte comme A et tente de lire, modifier et supprimer des données de B. Il exige 0 ligne lue et 0 ligne modifiée.

## Alternatives écartées

- **Une base de données par organisateur.** C'est l'isolation la plus forte, mais il faudrait une base, une migration et une sauvegarde par organisateur, et des milliers de connexions. Elle est disproportionnée pour notre volume et impossible à faire tourner proprement dans le Compose.
- **Un schéma par organisateur.** Les migrations sont multipliées par le nombre d'organisateurs, et il faut gérer la création de schémas dynamiques. La complexité dépasse le gain.
- **Un filtre dans le code seulement** (un `WHERE organisation_id` systématique, ou un filtre global de l'ORM). C'est simple, mais un oubli ou une requête SQL écrite à la main suffit à provoquer une fuite. La défense en profondeur vue en cours demande une seconde barrière, indépendante du code.

## Conséquences

- \+ Un bug dans une requête ne peut pas exposer les données d'un autre organisateur : la base filtre de toute façon.
- \+ L'isolation est démontrable au comité par un test automatique, et par une simple requête SQL qui renvoie 0 ligne.
- \+ Le journal d'audit ne peut pas être modifié par l'application elle-même.
- − Oublier `SET LOCAL` en début de transaction ferait échouer la requête, puisque le réglage est absent. C'est un échec sûr : on ne voit rien plutôt que tout. Il faut néanmoins le centraliser dans un intercepteur NestJS unique.
- − La RLS ajoute un léger coût aux requêtes du back-office. Il est négligeable avec un index sur `organisation_id`, et le back-office n'est pas sur le chemin critique de la vente.
- − Les opérations d'administration de la plateforme, comme les migrations ou le support, nécessitent un rôle distinct autorisé à contourner la RLS. Ce rôle doit être réservé et audité.
