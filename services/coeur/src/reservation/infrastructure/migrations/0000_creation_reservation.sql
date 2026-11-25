CREATE SCHEMA "reservation";
--> statement-breakpoint
CREATE TYPE "reservation"."statut_siege" AS ENUM('libre', 'bloque', 'vendu');--> statement-breakpoint
CREATE TABLE "reservation"."billet" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evenement_id" uuid NOT NULL,
	"siege_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"acheteur_id" text NOT NULL,
	"prix_centimes" integer NOT NULL,
	"emis_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billet_place_unique" UNIQUE("evenement_id","siege_id")
);
--> statement-breakpoint
CREATE TABLE "reservation"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"cle" text NOT NULL,
	"type" text NOT NULL,
	"contenu" jsonb NOT NULL,
	"traceparent" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"publie_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reservation"."reservation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evenement_id" uuid NOT NULL,
	"acheteur_id" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation"."siege" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evenement_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"categorie_id" uuid NOT NULL,
	"numero" text,
	"statut" "reservation"."statut_siege" DEFAULT 'libre' NOT NULL,
	"reservation_id" uuid,
	"bloque_jusqua" timestamp with time zone,
	CONSTRAINT "siege_statut_coherent" CHECK (statut = 'libre'
        OR (statut = 'bloque' AND reservation_id IS NOT NULL AND bloque_jusqua IS NOT NULL)
        OR (statut = 'vendu' AND reservation_id IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "reservation"."billet" ADD CONSTRAINT "billet_siege_id_siege_id_fk" FOREIGN KEY ("siege_id") REFERENCES "reservation"."siege"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation"."billet" ADD CONSTRAINT "billet_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "reservation"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_a_publier_idx" ON "reservation"."outbox" USING btree ("cree_le") WHERE "reservation"."outbox"."publie_le" IS NULL;--> statement-breakpoint
CREATE INDEX "siege_disponibilite_idx" ON "reservation"."siege" USING btree ("evenement_id","categorie_id","statut");