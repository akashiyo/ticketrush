CREATE SCHEMA "organisateurs";
--> statement-breakpoint
CREATE TYPE "organisateurs"."placement" AS ENUM('numerote', 'libre');--> statement-breakpoint
CREATE TYPE "organisateurs"."statut_evenement" AS ENUM('brouillon', 'publie');--> statement-breakpoint
CREATE TABLE "organisateurs"."audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"utilisateur_id" text NOT NULL,
	"action" text NOT NULL,
	"objet" text NOT NULL,
	"objet_id" uuid NOT NULL,
	"avant" jsonb,
	"apres" jsonb,
	"le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisateurs"."evenement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"artiste" text,
	"genre" text,
	"salle_id" uuid NOT NULL,
	"debut_le" timestamp with time zone NOT NULL,
	"statut" "organisateurs"."statut_evenement" DEFAULT 'brouillon' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisateurs"."outbox" (
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
CREATE TABLE "organisateurs"."salle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"ville" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisateurs"."tarif" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evenement_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"placement" "organisateurs"."placement" NOT NULL,
	"capacite" integer NOT NULL,
	"prix_centimes" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisateurs"."evenement" ADD CONSTRAINT "evenement_salle_id_salle_id_fk" FOREIGN KEY ("salle_id") REFERENCES "organisateurs"."salle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisateurs"."tarif" ADD CONSTRAINT "tarif_evenement_id_evenement_id_fk" FOREIGN KEY ("evenement_id") REFERENCES "organisateurs"."evenement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_organisation_idx" ON "organisateurs"."audit" USING btree ("organisation_id","id");--> statement-breakpoint
CREATE INDEX "evenement_organisation_idx" ON "organisateurs"."evenement" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "outbox_a_publier_idx" ON "organisateurs"."outbox" USING btree ("ordre") WHERE publie_le IS NULL;--> statement-breakpoint
CREATE INDEX "tarif_evenement_idx" ON "organisateurs"."tarif" USING btree ("evenement_id");