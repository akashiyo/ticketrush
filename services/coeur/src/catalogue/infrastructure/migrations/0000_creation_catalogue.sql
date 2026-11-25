CREATE SCHEMA "catalogue";
--> statement-breakpoint
CREATE TYPE "catalogue"."placement" AS ENUM('numerote', 'libre');--> statement-breakpoint
CREATE TYPE "catalogue"."statut_evenement" AS ENUM('brouillon', 'publie');--> statement-breakpoint
CREATE TABLE "catalogue"."categorie" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evenement_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"placement" "catalogue"."placement" NOT NULL,
	"capacite" integer NOT NULL,
	"prix_centimes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue"."evenement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"artiste" text,
	"genre" text,
	"salle_id" uuid NOT NULL,
	"debut_le" timestamp with time zone NOT NULL,
	"statut" "catalogue"."statut_evenement" DEFAULT 'brouillon' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ordre" bigserial NOT NULL,
	"topic" text NOT NULL,
	"cle" text NOT NULL,
	"type" text NOT NULL,
	"contenu" jsonb NOT NULL,
	"traceparent" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"publie_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalogue"."salle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"ville" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogue"."categorie" ADD CONSTRAINT "categorie_evenement_id_evenement_id_fk" FOREIGN KEY ("evenement_id") REFERENCES "catalogue"."evenement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue"."evenement" ADD CONSTRAINT "evenement_salle_id_salle_id_fk" FOREIGN KEY ("salle_id") REFERENCES "catalogue"."salle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_a_publier_idx" ON "catalogue"."outbox" USING btree ("ordre") WHERE publie_le IS NULL;