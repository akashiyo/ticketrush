# ADR 005 — Communication : synchrone pour ce que l'utilisateur attend, événements entre contextes

Statut : Proposé (2026-11-24) · Responsable : P1

## Contexte

Les unités déployables (ADR 001 et 002) doivent échanger des informations :
- la File d'attente doit autoriser un acheteur à réserver dans le Cœur ;
- le Cœur doit appeler le prestataire de paiement ;
- le catalogue public (Meilisearch) doit refléter les événements publiés ;
- l'Analytique doit suivre chaque vente.

Plusieurs scénarios contraignent ces échanges :
- **P-2** : l'acheteur doit savoir tout de suite si sa place est bloquée et si son paiement est accepté.
- **D-2** : l'arrêt de l'Analytique ne doit provoquer aucune erreur côté achat.
- **D-1** : un prestataire de paiement lent ou absent ne doit pas immobiliser le Cœur.
- **M-1** : ajouter un nouveau consommateur d'événements ne doit pas modifier le producteur.

## Décision

**Synchrone (REST + OpenAPI) seulement quand l'utilisateur attend la réponse :**

| Appel | Pourquoi synchrone |
|---|---|
| Navigateur → File d'attente (entrée, position) | L'acheteur attend sa position |
| Navigateur → Cœur (recherche, réservation, paiement, back-office) | L'acheteur ou l'organisateur attend le résultat |
| Cœur → Faux prestataire de paiement | L'acheteur attend l'acceptation de son paiement |

L'appel au prestataire de paiement, le seul appel synchrone entre deux unités déployables, est protégé :
- un **délai maximal de 2 secondes** ;
- **de nouvelles tentatives** en nombre limité, avec un délai qui augmente à chaque fois et une part d'aléatoire, uniquement pour les erreurs temporaires ;
- une **clé d'idempotence** par paiement, pour qu'une nouvelle tentative ne débite jamais deux fois ;
- un **disjoncteur** : quand le prestataire échoue trop souvent, le Cœur arrête de l'appeler et répond tout de suite « paiement indisponible ». La place reste bloquée jusqu'à expiration (ADR 003).

**Asynchrone (événements sur Redpanda, ADR 006) entre contextes, pour tout ce qui peut être différé :**

| Événement | Producteur | Consommateurs |
|---|---|---|
| `EvenementPublie`, `EvenementModifie`, `TarifModifie` | Cœur (Organisateurs) | Projection Meilisearch, Analytique |
| `PlaceBloquee`, `BlocageExpire`, `BilletEmis` | Cœur (Réservation) | Analytique, projection des disponibilités |
| `AcheteurEntreDansLaFile`, `AcheteurAdmis` | File d'attente | Analytique |

- Les événements du Cœur sont publiés par l'**Outbox** (ADR 007) : jamais perdus, mais livrés **au moins une fois**. Chaque consommateur est donc idempotent.
- Les schémas d'événements sont décrits en **AsyncAPI** et versionnés de façon compatible.

**Aucun appel direct de la File d'attente vers le Cœur.** L'admission est portée par un **jeton signé** que l'acheteur présente au Cœur (ADR 011). Le Cœur n'a pas besoin que la File d'attente soit joignable pour accepter un acheteur déjà admis.

## Alternatives écartées

- **Tout en synchrone (REST entre tous les services).** Le Cœur appellerait l'Analytique à chaque vente. Si elle ralentit ou s'arrête, la vente ralentit ou échoue (D-2). Les latences s'additionnent sur le chemin critique.
- **Tout en asynchrone, y compris la réservation.** L'acheteur enverrait sa demande puis attendrait une notification. On ne pourrait plus lui dire tout de suite « place prise » ou « place à vous » (P-2). Le parcours se compliquerait, avec de l'interrogation régulière ou du temps réel côté client.
- **gRPC entre services.** Il est plus performant que REST, mais peu adapté aux appels depuis le navigateur. Il ajoute un outillage (fichiers Protobuf, proxy pour le web) que rien ne justifie pour un seul appel synchrone entre services.
- **La File d'attente qui appelle le Cœur pour l'informer de chaque admission.** On couplerait temporellement les deux unités : une lenteur du Cœur bloquerait les admissions. Le jeton signé rend cet appel inutile.

## Conséquences

- \+ La vente ne dépend ni de l'Analytique ni de la projection du catalogue : on peut les arrêter en soutenance sans erreur côté achat (D-2).
- \+ Un nouveau consommateur, par exemple une notification par e-mail, s'abonne aux événements existants sans toucher au Cœur (M-1).
- \+ La panne du prestataire de paiement est contenue par le délai maximal et le disjoncteur (D-1).
- − Le catalogue et l'Analytique sont **cohérents à terme** : un événement publié apparaît dans la recherche quelques secondes plus tard. Le back-office de l'organisateur, lui, lit PostgreSQL et voit ses changements tout de suite.
- − Les événements peuvent arriver en double : chaque consommateur doit mémoriser ceux qu'il a déjà traités.
- − Suivre une vente à travers les événements demande le traçage distribué (OpenTelemetry, ADR 017). Sans lui, le flux devient difficile à déboguer.
