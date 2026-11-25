import { type Index, Meilisearch, MeilisearchApiError, type Task } from "meilisearch";

import {
  type CriteresRecherche,
  prixMinimum,
  type ResultatRecherche,
  type VueEvenement,
} from "../domaine/evenement.js";
import type { IndexRecherche } from "../domaine/ports.js";

const NOM_INDEX = "evenements";

/** Un document de l'index : la vue, plus deux champs calculés pour filtrer et trier. */
type DocumentIndex = VueEvenement & {
  id: string;
  /** La date en secondes : Meilisearch ne filtre et ne trie que des nombres. */
  debutLeTs: number;
  prixMinCentimes: number;
};

/** Réglages de l'index (ADR 014) : ce qu'on cherche, ce qu'on filtre, ce qu'on trie. */
export const REGLAGES = {
  // Dans l'ordre d'importance : un mot du titre compte plus qu'un mot de la ville.
  searchableAttributes: ["titre", "artiste", "salle.nom", "salle.ville", "genre"],
  filterableAttributes: ["salle.ville", "genre", "debutLeTs", "prixMinCentimes"],
  sortableAttributes: ["debutLeTs"],
};

/** Une tâche Meilisearch se termine aussi en échec, sans lever d'erreur : on vérifie son statut. */
function verifier(tache: Task): void {
  if (tache.status !== "succeeded") {
    throw new Error(
      `Tâche Meilisearch ${tache.type} : ${tache.status} (${tache.error?.message ?? "?"})`,
    );
  }
}

const guillemets = (valeur: string) => `"${valeur.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const secondes = (date: Date) => Math.floor(date.getTime() / 1000);

/** Les critères de recherche en filtre Meilisearch. Les valeurs sont échappées. */
export function construireFiltre(criteres: CriteresRecherche): string[] {
  const filtre: string[] = [];
  if (criteres.ville) filtre.push(`salle.ville = ${guillemets(criteres.ville)}`);
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
  private readonly index: Index<DocumentIndex>;
  private pret: Promise<void> | null = null;

  constructor(private readonly client: Meilisearch) {
    this.index = client.index<DocumentIndex>(NOM_INDEX);
  }

  static creer(url: string, cle: string): IndexMeilisearch {
    return new IndexMeilisearch(new Meilisearch({ host: url, apiKey: cle }));
  }

  async lire(evenementId: string): Promise<VueEvenement | null> {
    await this.preparer();
    try {
      const d = await this.index.getDocument(evenementId);
      // Les champs calculés pour l'index (id, debutLeTs, prixMinCentimes) ne font pas partie de la vue.
      return {
        evenementId: d.evenementId,
        titre: d.titre,
        artiste: d.artiste,
        genre: d.genre,
        salle: d.salle,
        debutLe: d.debutLe,
        categories: d.categories,
        version: d.version,
      };
    } catch (erreur) {
      if (erreur instanceof MeilisearchApiError && erreur.response.status === 404) return null;
      throw erreur;
    }
  }

  async ecrire(vue: VueEvenement): Promise<void> {
    await this.preparer();
    const document: DocumentIndex = {
      ...vue,
      id: vue.evenementId,
      debutLeTs: secondes(new Date(vue.debutLe)),
      prixMinCentimes: prixMinimum(vue.categories),
    };
    // On attend la fin de l'indexation : le fait suivant de la même vente lira la bonne version.
    verifier(await this.index.addDocuments([document], { primaryKey: "id" }).waitTask());
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
      evenements: reponse.hits.map((d) => ({
        id: d.id,
        titre: d.titre,
        artiste: d.artiste,
        genre: d.genre,
        salle: d.salle.nom,
        ville: d.salle.ville,
        debutLe: d.debutLe,
        prixMinCentimes: d.prixMinCentimes,
      })),
    };
  }

  /** Crée l'index et ses réglages au premier usage ; réessaie au suivant en cas d'échec. */
  private preparer(): Promise<void> {
    this.pret ??= (async () => {
      const creation = await this.client.createIndex(NOM_INDEX, { primaryKey: "id" }).waitTask();
      if (creation.error?.code !== "index_already_exists") verifier(creation);
      verifier(await this.index.updateSettings(REGLAGES).waitTask());
    })().catch((erreur: unknown) => {
      this.pret = null;
      throw erreur;
    });
    return this.pret;
  }
}
