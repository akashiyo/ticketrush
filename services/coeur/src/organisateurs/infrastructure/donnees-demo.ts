import { randomUUID } from "node:crypto";

import { TOPIC_CATALOGUE } from "@ticketrush/contrats";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { versOutbox } from "../../commun/evenements/outbox.js";
import { VENTE_DEMO } from "../../commun/vente-demo.js";
import type { Evenement } from "../domaine/evenement.js";
import { versEvenementCatalogue } from "./contrat.js";
import { evenement, outbox, salle, tarif } from "./schema.js";

const ARENE = { id: "c0a1e000-0000-4000-8000-000000000001", nom: "Arène du Lac", ville: "Lyon" };
const HANGAR = { id: "c0a1e000-0000-4000-8000-000000000002", nom: "Le Hangar 14", ville: "Nantes" };
const PALAIS = {
  id: "c0a1e000-0000-4000-8000-000000000003",
  nom: "Palais des Sports du Moulin",
  ville: "Lille",
};
const AUDITORIUM = {
  id: "c0a1e000-0000-4000-8000-000000000004",
  nom: "Grand Auditorium",
  ville: "Paris",
};
export const SALLES_DEMO = [ARENE, HANGAR, PALAIS, AUDITORIUM];

const publie = (e: Omit<Evenement, "organisationId" | "statut" | "version">): Evenement => ({
  ...e,
  organisationId: VENTE_DEMO.organisationId,
  statut: "publie",
  version: 1,
});

/**
 * Événements de démonstration d'Alpha Productions (artistes et salles fictifs). Le premier est
 * la vente de 5 000 places : seul celui-là a des places dans la Réservation.
 */
export const EVENEMENTS_DEMO: Evenement[] = [
  publie({
    id: VENTE_DEMO.evenementId,
    titre: "Les Électrons Libres — Tournée 2027",
    artiste: "Les Électrons Libres",
    genre: "Pop",
    salle: ARENE,
    debutLe: new Date("2027-03-12T19:00:00.000Z"),
    tarifs: [
      {
        id: VENTE_DEMO.fosse.id,
        libelle: "Fosse",
        placement: "libre",
        capacite: VENTE_DEMO.fosse.places,
        prixCentimes: VENTE_DEMO.fosse.prixCentimes,
      },
      {
        id: VENTE_DEMO.categorie1.id,
        libelle: "Catégorie 1",
        placement: "numerote",
        capacite: VENTE_DEMO.categorie1.rangs * VENTE_DEMO.categorie1.parRang,
        prixCentimes: VENTE_DEMO.categorie1.prixCentimes,
      },
    ],
  }),
  publie({
    id: "c0a1e000-0000-4000-8000-000000000101",
    titre: "Nuit Jazz au Port",
    artiste: "Quartet Marée Haute",
    genre: "Jazz",
    salle: HANGAR,
    debutLe: new Date("2027-02-05T20:00:00.000Z"),
    tarifs: [
      {
        id: "c0a1e000-0000-4000-8000-000000001011",
        libelle: "Placement libre",
        placement: "libre",
        capacite: 400,
        prixCentimes: 3_500,
      },
    ],
  }),
  publie({
    id: "c0a1e000-0000-4000-8000-000000000102",
    titre: "Finale régionale de handball",
    artiste: null,
    genre: "Sport",
    salle: PALAIS,
    debutLe: new Date("2027-04-18T16:30:00.000Z"),
    tarifs: [
      {
        id: "c0a1e000-0000-4000-8000-000000001021",
        libelle: "Tribune",
        placement: "numerote",
        capacite: 3_000,
        prixCentimes: 2_500,
      },
    ],
  }),
  publie({
    id: "c0a1e000-0000-4000-8000-000000000103",
    titre: "Orchestre des Collines — Symphonie n° 9",
    artiste: "Orchestre des Collines",
    genre: "Classique",
    salle: AUDITORIUM,
    debutLe: new Date("2027-05-20T18:30:00.000Z"),
    tarifs: [
      {
        id: "c0a1e000-0000-4000-8000-000000001031",
        libelle: "Parterre",
        placement: "numerote",
        capacite: 1_200,
        prixCentimes: 5_500,
      },
    ],
  }),
  publie({
    id: "c0a1e000-0000-4000-8000-000000000104",
    titre: "Électro sous les étoiles",
    artiste: "DJ Nébuleuse",
    genre: "Électro",
    salle: ARENE,
    debutLe: new Date("2027-06-21T20:00:00.000Z"),
    tarifs: [
      {
        id: "c0a1e000-0000-4000-8000-000000001041",
        libelle: "Fosse",
        placement: "libre",
        capacite: 3_000,
        prixCentimes: 3_900,
      },
    ],
  }),
];

/**
 * Crée les salles et publie les événements de démonstration s'ils n'existent pas encore : chaque
 * événement est écrit publié, avec son EvenementPublie dans l'Outbox, dans la même transaction
 * (ADR 007). Le relais le publie, la projection du Catalogue l'indexe : tout le chemin du CQRS
 * est exercé dès le démarrage.
 */
export async function chargerOrganisateursDemo(db: NodePgDatabase): Promise<boolean> {
  const deja = await db.select({ id: salle.id }).from(salle).limit(1);
  if (deja.length > 0) return false;

  await db.transaction(async (tx) => {
    await tx.insert(salle).values(SALLES_DEMO);
    // La RLS s'applique aussi au propriétaire des tables (FORCE) : on fixe l'organisation.
    await tx.execute(
      sql`SELECT set_config('app.organisation_id', ${VENTE_DEMO.organisationId}, true)`,
    );
    for (const e of EVENEMENTS_DEMO) {
      await tx.insert(evenement).values({
        id: e.id,
        organisationId: e.organisationId,
        titre: e.titre,
        artiste: e.artiste,
        genre: e.genre,
        salleId: e.salle.id,
        debutLe: e.debutLe,
        statut: e.statut,
        version: e.version,
      });
      await tx
        .insert(tarif)
        .values(
          e.tarifs.map((t) => ({ ...t, evenementId: e.id, organisationId: e.organisationId })),
        );
      const annonce = versEvenementCatalogue(e, "EvenementPublie", randomUUID());
      await tx.insert(outbox).values(versOutbox(TOPIC_CATALOGUE, annonce));
    }
  });
  return true;
}
