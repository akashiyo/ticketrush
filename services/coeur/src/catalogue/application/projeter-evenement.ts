import type { VueEvenement } from "../domaine/evenement.js";
import type { MagasinVues } from "../domaine/ports.js";

/** Ce que la projection retient d'un événement du catalogue, traduit depuis le contrat. */
export type FaitCatalogue =
  /** EvenementPublie ou EvenementModifie : l'état complet de l'événement. */
  | { type: "etat"; vue: VueEvenement }
  /** TarifModifie : le prix d'une catégorie. */
  | {
      type: "tarif";
      evenementId: string;
      categorieId: string;
      prixCentimes: number;
      version: number;
    };

/**
 * Projection du catalogue (CQRS, ADR 014) : chaque fait met à jour toutes les vues (index de
 * recherche, fiches).
 *
 * Les événements arrivent au moins une fois, et une reconstruction rejoue toute la rétention :
 * chaque fait porte la version de l'événement, et un fait plus ancien que ce qu'un magasin
 * contient est ignoré par ce magasin. Rejouer, dédoubler ou réordonner les faits donne donc
 * toujours les mêmes vues. Les magasins sont traités un par un : si l'un est en panne, le fait
 * sera rejoué et les autres l'ignoreront.
 */
export class ProjeterEvenement {
  constructor(private readonly magasins: MagasinVues[]) {}

  async executer(fait: FaitCatalogue): Promise<void> {
    for (const magasin of this.magasins) await this.projeter(magasin, fait);
  }

  private async projeter(magasin: MagasinVues, fait: FaitCatalogue): Promise<void> {
    const evenementId = fait.type === "etat" ? fait.vue.evenementId : fait.evenementId;
    const version = fait.type === "etat" ? fait.vue.version : fait.version;
    const actuelle = await magasin.lire(evenementId);
    if (actuelle && actuelle.version >= version) return;

    if (fait.type === "etat") return magasin.ecrire(fait.vue);
    // Un tarif sans vue enregistrée ne peut pas être appliqué : l'état complet suivant le portera.
    if (!actuelle) return;
    await magasin.ecrire({
      ...actuelle,
      categories: actuelle.categories.map((c) =>
        c.categorieId === fait.categorieId ? { ...c, prixCentimes: fait.prixCentimes } : c,
      ),
      version,
    });
  }
}
