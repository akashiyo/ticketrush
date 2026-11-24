# ADR 003 — Cohérence du stock de places : réservation atomique et contrainte d'unicité dans PostgreSQL

Statut : Proposé (2026-11-24) · Responsable : P1

## Contexte

La règle absolue du sujet : **ne jamais vendre deux fois la même place**. Le test de charge doit le prouver avec 50 000 acheteurs virtuels pour 5 000 places (scénario C-1).

Au pic, des centaines d'acheteurs admis tentent de bloquer les mêmes places dans la même seconde. Le mécanisme doit :
- refuser la seconde tentative **sans ambiguïté**, même avec plusieurs instances du Cœur en parallèle ;
- répondre vite à l'acheteur qui perd la place (P-2 : blocage confirmé en moins de 500 ms au p99) ;
- libérer une place bloquée si l'acheteur ne paie pas, ou si le prestataire de paiement tombe (D-1) ;
- rester correct **même si notre code a un bug** : la garantie ne doit pas reposer uniquement sur la logique applicative.

## Décision

**PostgreSQL est la seule source de vérité du stock.** La garantie repose sur deux protections indépendantes.

**1. Un blocage atomique par un seul `UPDATE` conditionnel**

```sql
-- Place numérotée choisie par l'acheteur
UPDATE reservation.siege
SET    statut = 'bloque', reservation_id = $1, bloque_jusqua = now() + interval '10 minutes'
WHERE  evenement_id = $2 AND siege_id = $3
  AND  (statut = 'libre' OR (statut = 'bloque' AND bloque_jusqua < now()))
RETURNING siege_id;
-- 0 ligne renvoyée → la place est déjà prise : réponse 409 immédiate
```

PostgreSQL verrouille la ligne pendant l'`UPDATE`. Deux transactions concurrentes ne peuvent pas toutes les deux voir `statut = 'libre'` puis l'écrire. La seconde réévalue la condition après la première et ne modifie rien.

Pour une **catégorie en placement libre** (fosse), on prend la première place libre sans attendre les verrous des autres :

```sql
UPDATE reservation.siege SET statut = 'bloque', reservation_id = $1, bloque_jusqua = now() + interval '10 minutes'
WHERE  id = (SELECT id FROM reservation.siege
             WHERE evenement_id = $2 AND categorie = $3 AND statut = 'libre'
             LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING siege_id;
```

**2. Une contrainte d'unicité sur les billets, comme filet de sécurité**

```sql
ALTER TABLE reservation.billet ADD CONSTRAINT billet_place_unique UNIQUE (evenement_id, siege_id);
```

Le billet est émis dans la **même transaction** que le passage de la place à `vendu`. Cette transaction vérifie que la place est toujours bloquée **par cette réservation**. Même si un bug laissait passer deux émissions, la base rejetterait la seconde.

**3. L'expiration des blocages**

- Un blocage dure 10 minutes.
- Une place expirée redevient réservable **immédiatement**, grâce à la condition `bloque_jusqua < now()` du blocage : aucune tâche n'a besoin de tourner pour ça.
- Un worker planifié repasse quand même les places expirées à `libre`, pour que le catalogue et l'analytique affichent des disponibilités justes.

**4. La preuve après le test de charge**

```sql
SELECT evenement_id, siege_id, count(*) FROM reservation.billet GROUP BY 1, 2 HAVING count(*) > 1;  -- doit renvoyer 0 ligne
SELECT count(*) FROM reservation.billet WHERE evenement_id = $1;                                    -- doit être ≤ 5 000
```

Ces deux requêtes sont lancées automatiquement à la fin du scénario k6. Leur résultat figure dans le rapport de charge.

## Alternatives écartées

- **Un compteur dans Redis (`DECR` ou script Lua), puis l'écriture dans PostgreSQL.** C'est très rapide, mais on aurait **deux sources de vérité**. Un crash entre les deux écritures, ou un Redis qui perd des données au redémarrage, désynchronise le stock. La garantie ne serait plus apportée par la base.
- **`SELECT … FOR UPDATE`, puis un `UPDATE` séparé.** C'est correct, mais il faut deux allers-retours et le verrou est tenu plus longtemps, donc moins de débit au pic. Notre `UPDATE` conditionnel fait la même chose en un seul ordre. (Nous gardons `FOR UPDATE SKIP LOCKED` pour le placement libre, où il évite justement d'attendre les verrous.)
- **Un verrou optimiste par numéro de version.** Au pic, presque toutes les tentatives sur une place convoitée échouent puis sont rejouées : une avalanche de nouvelles tentatives au pire moment.
- **L'isolation `SERIALIZABLE` sur toutes les transactions.** Le résultat est correct, mais PostgreSQL annule beaucoup de transactions en conflit sous forte concurrence, avec la même tempête de nouvelles tentatives.
- **Un seul processus qui traite toutes les réservations à la suite, depuis une file.** Il n'y a plus aucune concurrence, mais le débit est plafonné par ce processus unique. L'acheteur attend sa réponse de façon asynchrone, ce qui contredit P-2.

## Conséquences

- \+ Zéro survente est **garanti par la base**, pas seulement par le code. C'est l'argument le plus fort à défendre en soutenance.
- \+ L'acheteur qui perd une place le sait immédiatement (409), sans attente ni nouvelle tentative.
- \+ La preuve de cohérence se résume à deux requêtes SQL vérifiables par le comité.
- − Toutes les écritures de stock passent par une seule base PostgreSQL. Son débit d'écriture fixe le plafond de la réservation. C'est le rôle de la file d'attente de limiter le nombre d'acheteurs admis à la fois (ADR 008).
- − Sur une place très convoitée, les verrous de ligne créent une courte contention. Elle est acceptable, car chaque `UPDATE` ne dure que quelques millisecondes.
- − Un blocage abandonné immobilise la place jusqu'à 10 minutes. C'est le compromis assumé entre laisser à l'acheteur le temps de payer et remettre vite la place en vente.
