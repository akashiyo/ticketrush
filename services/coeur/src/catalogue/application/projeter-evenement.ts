import { type DocumentRecherche, prixMinimum } from "../domaine/evenement.js";
import type { IndexRecherche } from "../domaine/ports.js";

/** Ce que la projection retient d'un événement du catalogue, traduit depuis le contrat. */
export type FaitCatalogue =
  /** EvenementPublie ou EvenementModifie : l'état complet de l'événement. */
  | { type: "etat"; document: DocumentRecherche }
  /** TarifModifie : le prix d'une catégorie. */
  | {
      type: "tarif";
      evenementId: string;
      categorieId: string;
      prixCentimes: number;
      version: number;
    };

/**
 * Projection du catalogue vers l'index de recherche (CQRS, ADR 014).
 *
 * Les événements arrivent au moins une fois, et une reconstruction rejoue toute la rétention :
 * chaque fait porte la version de l'événement, et un fait plus ancien que ce qui est indexé est
 * ignoré. Rejouer, dédoubler ou réordonner les faits donne donc toujours le même index.
 */
export class ProjeterEvenement {
  constructor(private readonly index: IndexRecherche) {}

  async executer(fait: FaitCatalogue): Promise<"indexe" | "ignore"> {
    const evenementId = fait.type === "etat" ? fait.document.id : fait.evenementId;
    const actuel = await this.index.lire(evenementId);
    const version = fait.type === "etat" ? fait.document.version : fait.version;
    if (actuel && actuel.version >= version) return "ignore";

    if (fait.type === "etat") {
      await this.index.indexer(fait.document);
      return "indexe";
    }
    // Un tarif sans document indexé ne peut pas être appliqué : l'état complet suivant le portera.
    if (!actuel) return "ignore";
    const categories = actuel.categories.map((c) =>
      c.categorieId === fait.categorieId ? { ...c, prixCentimes: fait.prixCentimes } : c,
    );
    await this.index.indexer({
      ...actuel,
      categories,
      prixMinCentimes: prixMinimum(categories),
      version,
    });
    return "indexe";
  }
}
