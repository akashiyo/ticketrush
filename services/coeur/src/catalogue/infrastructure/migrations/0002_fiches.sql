CREATE TABLE "catalogue"."fiche" (
	"evenement_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"contenu" jsonb NOT NULL
);
