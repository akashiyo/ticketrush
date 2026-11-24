# ADR 011 — Jetons d'accès à la vente : JWT signés par la File d'attente, à usage unique

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Le sujet impose des **jetons d'accès signés et limités dans le temps** pour entrer dans la vente.

Quand la File d'attente admet un acheteur, celui-ci doit pouvoir réserver dans le Cœur. Le Cœur doit alors vérifier trois choses :
- l'acheteur a **vraiment** été admis, et n'a pas fabriqué ou modifié son autorisation ;
- l'admission est **encore valide** ;
- elle n'est **utilisée qu'une fois**, et uniquement par l'acheteur à qui elle a été donnée.

Contraintes :
- **ADR 005** : le Cœur ne doit pas appeler la File d'attente pour vérifier une admission (pas de couplage temporel).
- **S-2** : un jeton rejoué ou expiré doit être refusé dans 100 % des cas.
- **P-2** : la vérification ne doit pas ralentir la réservation.

## Décision

À l'admission, la **File d'attente émet un jeton JWT** signé avec la bibliothèque `jose`.

**Le contenu du jeton**

| Champ | Contenu |
|---|---|
| `sub` | Identifiant de l'acheteur (le même que dans son jeton Keycloak) |
| `evt` | Identifiant de l'événement en vente |
| `aud` | `reservation` : le jeton n'est valable que pour le Cœur |
| `jti` | Identifiant unique du jeton |
| `iat`, `exp` | Date d'émission et expiration, **10 minutes** après l'admission |

**La signature est asymétrique (ES256).** La File d'attente signe avec sa clé privée. Le Cœur vérifie avec la clé publique et ne peut donc pas fabriquer de jetons : c'est le principe du moindre privilège. Le champ `kid` de l'en-tête identifie la clé, ce qui permet de la changer sans interruption.

**Les vérifications du Cœur, dans l'ordre :**
1. **Signature, expiration, `aud` et `evt`**, en local et sans appel réseau, en moins d'une milliseconde. Un jeton falsifié ou expiré est rejeté avant de solliciter quoi que ce soit.
2. **Le `sub` du jeton doit correspondre à l'acheteur connecté** : une admission transmise à quelqu'un d'autre ne sert à rien.
3. **Le jeton est consommé une seule fois**, lors du premier blocage de place. Le Cœur exécute dans Redis `SET jti:<jti> 1 NX EX <durée restante>`. Si la clé existe déjà, c'est un rejeu, refusé avec une erreur 403.

Ensuite, le paiement est autorisé par la réservation elle-même, qui appartient à l'acheteur, et non plus par le jeton.

## Alternatives écartées

- **Une session d'admission stockée côté serveur**, que le Cœur consulte à chaque requête. Le Cœur dépendrait de ce stockage pour **toutes** ses vérifications, y compris contre des jetons falsifiés. Avec un JWT, la signature élimine les faux jetons sans aucun appel.
- **Un jeton opaque stocké dans PostgreSQL.** Chaque vérification interroge la base qui protège le stock, alors qu'elle doit être réservée aux écritures de réservation (ADR 003).
- **Une signature symétrique (HS256, secret partagé).** Le Cœur détiendrait le secret, donc pourrait fabriquer des admissions. Une fuite du Cœur compromettrait aussi la file.
- **PASETO**, un format de jeton plus strict que JWT. Il est sûr, mais moins outillé et moins connu. JWT avec `jose`, un algorithme imposé et une vérification stricte de l'audience suffit à éviter les failles classiques de JWT.

## Conséquences

- \+ La signature des jetons se vérifie sans appel réseau, en moins de 5 ms (S-2). Le Cœur accepte un acheteur admis même si la File d'attente est momentanément indisponible.
- \+ Un jeton ne peut être ni falsifié, ni prolongé, ni transmis à quelqu'un d'autre, ni rejoué.
- \+ La File d'attente contrôle seule le rythme d'entrée dans la vente : elle n'émet un jeton qu'au rythme d'admission décidé (ADR 008).
- − La détection du rejeu dépend de Redis : si Redis est indisponible, le Cœur doit refuser les jetons, ce qui fait primer la sécurité sur la disponibilité. Cet appel n'a lieu **qu'une fois par acheteur admis**, soit quelques milliers d'appels, pas des centaines de milliers.
- − Un jeton expire au bout de 10 minutes, qu'il ait servi ou non. Un acheteur trop lent doit repasser par la file. C'est voulu, pour l'équité (E-1).
- − Il faut gérer la clé privée de signature : la stocker comme un secret et prévoir sa rotation.
