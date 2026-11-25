-- Isolation stricte entre organisateurs (ADR 016, scénarios S-3 et S-4).
--
-- 1. Un rôle applicatif sans privilège : ni superutilisateur, ni propriétaire des tables, ni
--    BYPASSRLS. Le Cœur l'endosse (SET LOCAL ROLE) dans chaque transaction du back-office.
-- 2. La Row-Level Security sur evenement, tarif et audit : une ligne n'est visible et modifiable
--    que si son organisation est celle fixée par le Cœur (set_config local à la transaction).
--    Réglage absent : NULLIF renvoie NULL, la comparaison est fausse, rien n'est visible.
--    C'est un échec sûr : on ne voit rien plutôt que tout.
-- 3. Le journal d'audit en ajout seul : le rôle peut insérer et lire, ni modifier ni supprimer.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'organisateurs_app') THEN
    CREATE ROLE organisateurs_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA organisateurs TO organisateurs_app;
--> statement-breakpoint
GRANT SELECT ON organisateurs.salle TO organisateurs_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON organisateurs.evenement, organisateurs.tarif TO organisateurs_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON organisateurs.audit TO organisateurs_app;
--> statement-breakpoint
GRANT INSERT ON organisateurs.outbox TO organisateurs_app;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA organisateurs TO organisateurs_app;
--> statement-breakpoint
ALTER TABLE organisateurs.evenement ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organisateurs.evenement FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY isolation_organisation ON organisateurs.evenement
  USING (organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE organisateurs.tarif ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organisateurs.tarif FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY isolation_organisation ON organisateurs.tarif
  USING (organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE organisateurs.audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organisateurs.audit FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY isolation_organisation ON organisateurs.audit
  USING (organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.organisation_id', true), '')::uuid);
