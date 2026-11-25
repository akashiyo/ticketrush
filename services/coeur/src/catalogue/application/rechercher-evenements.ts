import type { CriteresRecherche, ResultatRecherche } from "../domaine/evenement.js";
import type { IndexRecherche } from "../domaine/ports.js";

/** Au plus 50 résultats par page : une recherche reste bon marché, même au pic (P-3). */
export const PAR_PAGE_MAX = 50;

/**
 * Cas d'usage : rechercher dans le catalogue public (scénario P-3). La recherche n'interroge que
 * l'index : elle ne touche jamais la base qui protège le stock (ADR 014).
 */
export class RechercherEvenements {
  constructor(private readonly index: IndexRecherche) {}

  executer(criteres: CriteresRecherche): Promise<ResultatRecherche> {
    return this.index.rechercher({
      ...criteres,
      texte: criteres.texte.trim(),
      page: Math.max(1, Math.floor(criteres.page)),
      parPage: Math.min(PAR_PAGE_MAX, Math.max(1, Math.floor(criteres.parPage))),
    });
  }
}
