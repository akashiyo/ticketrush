import type { EtatEvenement, EvenementCatalogue } from "@ticketrush/contrats";

import type { FaitCatalogue } from "../application/projeter-evenement.js";
import { type DocumentRecherche, prixMinimum } from "../domaine/evenement.js";

/** Le document de recherche d'un événement, traduit depuis le contrat (langage publié). */
export function versDocument(evenementId: string, etat: EtatEvenement): DocumentRecherche {
  return {
    id: evenementId,
    titre: etat.titre,
    artiste: etat.artiste ?? null,
    genre: etat.genre ?? null,
    salle: etat.salle.nom,
    ville: etat.salle.ville,
    debutLe: etat.debutLe,
    debutLeTs: Math.floor(new Date(etat.debutLe).getTime() / 1000),
    prixMinCentimes: prixMinimum(etat.categories),
    categories: etat.categories.map((c) => ({
      categorieId: c.categorieId,
      libelle: c.libelle,
      prixCentimes: c.prixCentimes,
    })),
    version: etat.versionEvenement,
  };
}

export interface FaitTraduit {
  fait: FaitCatalogue;
  /** La fiche en cache est périmée : il faut l'invalider (ADR 015). */
  invaliderFiche: boolean;
}

/**
 * Traduit un message du topic `catalogue.evenements` en fait pour la projection. Un type inconnu
 * (événement ajouté plus tard au contrat) est ignoré : lecteur tolérant (cours, partie 7).
 */
export function traduireMessage(valeur: string): FaitTraduit | null {
  const evenement = JSON.parse(valeur) as EvenementCatalogue;
  switch (evenement.type) {
    case "EvenementPublie":
      return {
        fait: { type: "etat", document: versDocument(evenement.evenementId, evenement.donnees) },
        invaliderFiche: false,
      };
    case "EvenementModifie":
      return {
        fait: { type: "etat", document: versDocument(evenement.evenementId, evenement.donnees) },
        invaliderFiche: true,
      };
    case "TarifModifie":
      return {
        fait: {
          type: "tarif",
          evenementId: evenement.evenementId,
          categorieId: evenement.donnees.categorieId,
          prixCentimes: evenement.donnees.prixCentimes,
          version: evenement.donnees.versionEvenement,
        },
        invaliderFiche: true,
      };
    default:
      return null;
  }
}
