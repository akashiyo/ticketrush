import { type Index, Meilisearch, MeilisearchApiError } from "meilisearch";

import type {
  CriteresRecherche,
  DocumentRecherche,
  EvenementTrouve,
  ResultatRecherche,
} from "../domaine/evenement.js";
import type { IndexRecherche } from "../domaine/ports.js";

const NOM_INDEX = "evenements";

/** Réglages de l'index (ADR 014) : ce qu'on cherche, ce qu'on filtre, ce qu'on trie. */
export const REGLAGES = {
  // Dans l'ordre d'importance : un mot du titre compte plus qu'un mot de la ville.
  searchableAttributes: ["titre", "artiste", "salle", "ville", "genre"],
  filterableAttributes: ["ville", "genre", "debutLeTs", "prixMinCentimes"],
  sortableAttributes: ["debutLeTs"],
};

const guillemets = (valeur: string) => `"${valeur.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const secondes = (date: Date) => Math.floor(date.getTime() / 1000);

/** Les critères de recherche en filtre Meilisearch. Les valeurs sont échappées. */
export function construireFiltre(criteres: CriteresRecherche): string[] {
  const filtre: string[] = [];
  if (criteres.ville) filtre.push(`ville = ${guillemets(criteres.ville)}`);
  if (criteres.genre) filtre.push(`genre = ${guillemets(criteres.genre)}`);
  if (criteres.du) filtre.push(`debutLeTs >= ${secondes(criteres.du)}`);
  if (criteres.avant) filtre.push(`debutLeTs < ${secondes(criteres.avant)}`);
  return filtre;
}

/**
 * Le modèle de lecture du catalogue dans Meilisearch (ADR 014). La recherche publique n'interroge
 * que cet index : elle ne touche jamais PostgreSQL. L'index peut être recréé à tout moment en
 * rejouant les événements (rétention de 7 jours) : la projection est idempotente.
 */
export class IndexMeilisearch implements IndexRecherche {
  private readonly index: Index<DocumentRecherche>;
  private pret: Promise<void> | null = null;

  constructor(private readonly client: Meilisearch) {
    this.index = client.index<DocumentRecherche>(NOM_INDEX);
  }

  static creer(url: string, cle: string): IndexMeilisearch {
    return new IndexMeilisearch(new Meilisearch({ host: url, apiKey: cle }));
  }

  async lire(evenementId: string): Promise<DocumentRecherche | null> {
    await this.preparer();
    try {
      return await this.index.getDocument(evenementId);
    } catch (erreur) {
      if (erreur instanceof MeilisearchApiError && erreur.response.status === 404) return null;
      throw erreur;
    }
  }

  async indexer(document: DocumentRecherche): Promise<void> {
    await this.preparer();
    // On attend la fin de l'indexation : le fait suivant de la même vente lira la bonne version.
    await this.index.addDocuments([document], { primaryKey: "id" }).waitTask();
  }

  async rechercher(criteres: CriteresRecherche): Promise<ResultatRecherche> {
    await this.preparer();
    const reponse = await this.index.search(criteres.texte, {
      filter: construireFiltre(criteres),
      sort: ["debutLeTs:asc"],
      page: criteres.page,
      hitsPerPage: criteres.parPage,
    });
    return {
      total: reponse.totalHits ?? reponse.hits.length,
      page: criteres.page,
      parPage: criteres.parPage,
      evenements: reponse.hits.map(
        ({ version: _version, debutLeTs: _ts, ...visible }): EvenementTrouve => visible,
      ),
    };
  }

  /** Crée l'index et ses réglages au premier usage ; réessaie au suivant en cas d'échec. */
  private preparer(): Promise<void> {
    this.pret ??= (async () => {
      try {
        await this.client.createIndex(NOM_INDEX, { primaryKey: "id" }).waitTask();
      } catch (erreur) {
        if (!(
          erreur instanceof MeilisearchApiError && erreur.cause?.code === "index_already_exists"
        )) {
          throw erreur;
        }
      }
      await this.index.updateSettings(REGLAGES).waitTask();
    })().catch((erreur: unknown) => {
      this.pret = null;
      throw erreur;
    });
    return this.pret;
  }
}
