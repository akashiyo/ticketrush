-- Preuve de zéro survente (scénario C-1, ADR 003), lancée sur la base après le test de charge.
--   psql -v ON_ERROR_STOP=1 -v evenement=<uuid> -f controle-survente.sql
-- Échoue (code de sortie 3) si une seule règle est violée.

\set QUIET on
\pset footer off

-- 1. Une place n'a jamais plus d'un billet (la requête de l'ADR 003 : doit renvoyer 0 ligne).
SELECT count(*) AS doublons
FROM (SELECT 1 FROM reservation.billet
      WHERE evenement_id = :'evenement'
      GROUP BY evenement_id, siege_id HAVING count(*) > 1) d \gset

-- 2. Pas plus de billets que de places en vente (l'autre requête de l'ADR 003).
SELECT (SELECT count(*) FROM reservation.billet WHERE evenement_id = :'evenement') AS billets,
       (SELECT count(*) FROM reservation.siege  WHERE evenement_id = :'evenement') AS places \gset

-- 3. Tout billet correspond à une réservation payée.
SELECT count(*) AS billets_sans_paiement
FROM reservation.billet b JOIN reservation.reservation r ON r.id = b.reservation_id
WHERE b.evenement_id = :'evenement' AND r.statut <> 'payee' \gset

-- 4. Toute place vendue a exactement son billet, émis pour la réservation qui l'a achetée.
SELECT count(*) AS vendues_sans_billet
FROM reservation.siege s
LEFT JOIN reservation.billet b ON b.siege_id = s.id AND b.reservation_id = s.reservation_id
WHERE s.evenement_id = :'evenement' AND s.statut = 'vendu' AND b.id IS NULL \gset

-- Informations (pas des violations) : état final du stock et paiements à rembourser.
SELECT count(*) FILTER (WHERE statut = 'vendu')  AS vendues,
       count(*) FILTER (WHERE statut = 'bloque') AS bloquees,
       count(*) FILTER (WHERE statut = 'libre')  AS libres
FROM reservation.siege WHERE evenement_id = :'evenement' \gset
SELECT count(*) AS a_rembourser FROM reservation.reservation
WHERE evenement_id = :'evenement' AND statut = 'a_rembourser' \gset

\echo ''
\echo 'Contrôle de survente — événement' :evenement
\echo '  places en vente           :' :places
\echo '  billets émis              :' :billets
\echo '  vendues / bloquées / libres :' :vendues '/' :bloquees '/' :libres
\echo '  paiements à rembourser    :' :a_rembourser
\echo ''
\echo '  1. places avec plusieurs billets  :' :doublons '(attendu : 0)'
\echo '  2. billets au-delà du stock       :' 'billets <= places ?'
\echo '  3. billets sans paiement accepté  :' :billets_sans_paiement '(attendu : 0)'
\echo '  4. places vendues sans leur billet :' :vendues_sans_billet '(attendu : 0)'

SELECT (:doublons = 0 AND :billets <= :places AND :billets_sans_paiement = 0
        AND :vendues_sans_billet = 0) AS zero_survente \gset

\if :zero_survente
  \echo ''
  \echo 'RÉSULTAT : ZÉRO SURVENTE'
\else
  \echo ''
  \echo 'RÉSULTAT : SURVENTE OU INCOHÉRENCE DÉTECTÉE'
  DO $$ BEGIN RAISE EXCEPTION 'Contrôle de survente en échec'; END $$;
\endif
