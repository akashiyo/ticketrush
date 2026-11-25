import type { EtatEvenement, EvenementCatalogue } from "@ticketrush/contrats";

import type { FaitCatalogue } from "../application/projeter-evenement.js";
import type { VueEvenement } from "../domaine/evenement.js";

/** La vue publique d'un événement, traduite depuis le contrat (langage publié). */
export function versVue(evenementId: string, etat: EtatEvenement): VueEvenement {
  return {
    evenementId,
    titre: etat.titre,
    artiste: etat.artiste ?? null,
    genre: etat.genre ?? null,
    salle: { nom: etat.salle.nom, ville: etat.salle.ville },
    debutLe: etat.debutLe,
    categories: etat.categories.map((c) => ({
      categorieId: c.categorieId,
      libelle: c.libelle,
      placement: c.placement,
      capacite: c.capacite,
      prixCentimes: c.prixCentimes,
    })),
    version: etat.versionEvenement,
  };
}

/**
 * Traduit un message du topic `catalogue.evenements` en fait pour la projection. Un type inconnu
 * (événement ajouté plus tard au contrat) est ignoré : lecteur tolérant (cours, partie 7).
 */
export function traduireMessage(valeur: string): FaitCatalogue | null {
  const evenement = JSON.parse(valeur) as EvenementCatalogue;
  switch (evenement.type) {
    case "EvenementPublie":
    case "EvenementModifie":
      return { type: "etat", vue: versVue(evenement.evenementId, evenement.donnees) };
    case "TarifModifie":
      return {
        type: "tarif",
        evenementId: evenement.evenementId,
        categorieId: evenement.donnees.categorieId,
        prixCentimes: evenement.donnees.prixCentimes,
        version: evenement.donnees.versionEvenement,
      };
    default:
      return null;
  }
}

export const evenementDuFait = (fait: FaitCatalogue) =>
  fait.type === "etat" ? fait.vue.evenementId : fait.evenementId;
