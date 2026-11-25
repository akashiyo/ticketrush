import { randomUUID } from "node:crypto";

import { type EvenementPublie, TOPIC_CATALOGUE } from "@ticketrush/contrats";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { versOutbox } from "../../commun/evenements/outbox.js";
import { VENTE_DEMO } from "../../commun/vente-demo.js";
import { categorie, evenement, outbox, salle } from "./schema.js";

interface EvenementDemo {
  id: string;
  titre: string;
  artiste: string | null;
  genre: string;
  salle: { id: string; nom: string; ville: string };
  debutLe: string;
  categories: {
    id: string;
    libelle: string;
    placement: "numerote" | "libre";
    capacite: number;
    prixCentimes: number;
  }[];
}

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

/**
 * Catalogue de démonstration (artistes et salles fictifs). Le premier événement est la vente de
 * démonstration de 5 000 places : seul celui-là a des places dans la Réservation.
 */
export const CATALOGUE_DEMO: EvenementDemo[] = [
  {
    id: VENTE_DEMO.evenementId,
    titre: "Les Électrons Libres — Tournée 2027",
    artiste: "Les Électrons Libres",
    genre: "Pop",
    salle: ARENE,
    debutLe: "2027-03-12T19:00:00.000Z",
    categories: [
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
  },
  {
    id: "c0a1e000-0000-4000-8000-000000000101",
    titre: "Nuit Jazz au Port",
    artiste: "Quartet Marée Haute",
    genre: "Jazz",
    salle: HANGAR,
    debutLe: "2027-02-05T20:00:00.000Z",
    categories: [
      {
        id: "c0a1e000-0000-4000-8000-000000001011",
        libelle: "Placement libre",
        placement: "libre",
        capacite: 400,
        prixCentimes: 3_500,
      },
    ],
  },
  {
    id: "c0a1e000-0000-4000-8000-000000000102",
    titre: "Finale régionale de handball",
    artiste: null,
    genre: "Sport",
    salle: PALAIS,
    debutLe: "2027-04-18T16:30:00.000Z",
    categories: [
      {
        id: "c0a1e000-0000-4000-8000-000000001021",
        libelle: "Tribune",
        placement: "numerote",
        capacite: 3_000,
        prixCentimes: 2_500,
      },
    ],
  },
  {
    id: "c0a1e000-0000-4000-8000-000000000103",
    titre: "Orchestre des Collines — Symphonie n° 9",
    artiste: "Orchestre des Collines",
    genre: "Classique",
    salle: AUDITORIUM,
    debutLe: "2027-05-20T18:30:00.000Z",
    categories: [
      {
        id: "c0a1e000-0000-4000-8000-000000001031",
        libelle: "Parterre",
        placement: "numerote",
        capacite: 1_200,
        prixCentimes: 5_500,
      },
    ],
  },
  {
    id: "c0a1e000-0000-4000-8000-000000000104",
    titre: "Électro sous les étoiles",
    artiste: "DJ Nébuleuse",
    genre: "Électro",
    salle: ARENE,
    debutLe: "2027-06-21T20:00:00.000Z",
    categories: [
      {
        id: "c0a1e000-0000-4000-8000-000000001041",
        libelle: "Fosse",
        placement: "libre",
        capacite: 3_000,
        prixCentimes: 3_900,
      },
    ],
  },
];

/**
 * Publie le catalogue de démonstration s'il n'existe pas encore : chaque événement est écrit
 * publié, avec son EvenementPublie dans l'Outbox, dans la même transaction (ADR 007). Le relais
 * le publiera sur Redpanda et la projection l'indexera dans Meilisearch : le chemin complet du
 * CQRS est exercé dès le démarrage.
 */
export async function chargerCatalogueDemo(db: NodePgDatabase): Promise<boolean> {
  const deja = await db.select({ id: evenement.id }).from(evenement).limit(1);
  if (deja.length > 0) return false;

  await db.transaction(async (tx) => {
    const salles = new Map(CATALOGUE_DEMO.map((e) => [e.salle.id, e.salle]));
    await tx.insert(salle).values([...salles.values()]);
    for (const e of CATALOGUE_DEMO) {
      await tx.insert(evenement).values({
        id: e.id,
        organisationId: VENTE_DEMO.organisationId,
        titre: e.titre,
        artiste: e.artiste,
        genre: e.genre,
        salleId: e.salle.id,
        debutLe: new Date(e.debutLe),
        statut: "publie",
        version: 1,
      });
      await tx.insert(categorie).values(e.categories.map((c) => ({ ...c, evenementId: e.id })));
      const publie: EvenementPublie = {
        id: randomUUID(),
        type: "EvenementPublie",
        versionSchema: 1,
        survenuLe: new Date().toISOString(),
        evenementId: e.id,
        organisationId: VENTE_DEMO.organisationId,
        donnees: {
          titre: e.titre,
          ...(e.artiste ? { artiste: e.artiste } : {}),
          genre: e.genre,
          salle: { salleId: e.salle.id, nom: e.salle.nom, ville: e.salle.ville },
          debutLe: e.debutLe,
          categories: e.categories.map((c) => ({
            categorieId: c.id,
            libelle: c.libelle,
            placement: c.placement,
            capacite: c.capacite,
            prixCentimes: c.prixCentimes,
          })),
          devise: "EUR",
          versionEvenement: 1,
        },
      };
      await tx.insert(outbox).values(versOutbox(TOPIC_CATALOGUE, publie));
    }
  });
  return true;
}
