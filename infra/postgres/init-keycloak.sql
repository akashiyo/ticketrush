-- Crée la base de données de Keycloak, séparée des schémas des modules (ADR 004).
-- Idempotent : peut être rejoué à chaque « docker compose up » sans erreur,
-- y compris sur un volume PostgreSQL déjà initialisé.
--
-- Variables psql attendues : kc_user, kc_password, kc_db.

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'kc_user', :'kc_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'kc_user')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'kc_db', :'kc_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'kc_db')
\gexec
