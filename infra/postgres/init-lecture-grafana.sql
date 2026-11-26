-- Rôle en LECTURE SEULE pour Grafana (ADR 017, 018) : contrôle continu de l'invariant
-- « zéro survente » (ADR 003) et état du stock dans le tableau de bord de la vente.
--
-- Moindre privilège : lecture des seules tables billet et siege du schéma reservation,
-- transactions en lecture seule, requêtes limitées à 2 s et 5 connexions au plus, pour que
-- le tableau de bord ne puisse jamais charger la base qui protège le stock.
--
-- Lancé après le Cœur (ses migrations créent les tables). Idempotent : rejoué à chaque
-- « docker compose up ». Variables psql attendues : role, mdp, base.

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'mdp')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec

ALTER ROLE :"role" WITH LOGIN PASSWORD :'mdp' CONNECTION LIMIT 5;
ALTER ROLE :"role" SET default_transaction_read_only = on;
ALTER ROLE :"role" SET statement_timeout = '2s';

GRANT CONNECT ON DATABASE :"base" TO :"role";
GRANT USAGE ON SCHEMA reservation TO :"role";
GRANT SELECT ON reservation.billet, reservation.siege TO :"role";
