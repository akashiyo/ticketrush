import type { EtatEvenement, EvenementCatalogue } from "@ticketrush/contrats";

import type { Evenement, Publication } from "../domaine/evenement.js";

/** L'état public d'un événement, au format du contrat (langage publié, ADR 005). */
export function etatPublic(e: Evenement): EtatEvenement {
  return {
    titre: e.titre,
    ...(e.artiste ? { artiste: e.artiste } : {}),
    ...(e.genre ? { genre: e.genre } : {}),
    salle: { salleId: e.salle.id, nom: e.salle.nom, ville: e.salle.ville },
    debutLe: e.debutLe.toISOString(),
    categories: e.tarifs.map((t) => ({
      categorieId: t.id,
      libelle: t.libelle,
      placement: t.placement,
      capacite: t.capacite,
      prixCentimes: t.prixCentimes,
    })),
    devise: "EUR",
    versionEvenement: e.version,
  };
}

/** L'événement du contrat qui annonce un changement (ADR 005, 014). */
export function versEvenementCatalogue(
  e: Evenement,
  publication: Exclude<Publication, null>,
  id: string,
): EvenementCatalogue {
  const enveloppe = {
    id,
    versionSchema: 1 as const,
    survenuLe: new Date().toISOString(),
    evenementId: e.id,
    organisationId: e.organisationId,
  };
  if (publication === "EvenementPublie" || publication === "EvenementModifie") {
    return { ...enveloppe, type: publication, donnees: etatPublic(e) };
  }
  const tarif = e.tarifs.find((t) => t.id === publication.tarifId);
  if (!tarif) throw new Error(`Tarif absent de l'événement : ${publication.tarifId}`);
  return {
    ...enveloppe,
    type: "TarifModifie",
    donnees: {
      categorieId: tarif.id,
      prixCentimes: tarif.prixCentimes,
      devise: "EUR",
      versionEvenement: e.version,
    },
  };
}
