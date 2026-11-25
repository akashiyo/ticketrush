import { ErreurApi } from "../../commun/api-file";

/** Préfixe des appels au Cœur, routés par Traefik sur la même origine (ADR 013). */
const BASE_COEUR: string = import.meta.env.VITE_API_COEUR ?? "/api";

export interface EvenementTrouve {
  id: string;
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: string;
  ville: string;
  debutLe: string;
  prixMinCentimes: number;
}

export interface ResultatRecherche {
  total: number;
  page: number;
  parPage: number;
  evenements: EvenementTrouve[];
}

export interface FicheEvenement {
  evenementId: string;
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: { nom: string; ville: string };
  debutLe: string;
  categories: {
    categorieId: string;
    libelle: string;
    placement: "numerote" | "libre";
    prixCentimes: number;
    capacite: number;
  }[];
}

export interface CriteresRecherche {
  q: string;
  ville?: string;
  du?: string;
  au?: string;
  page?: number;
}

async function lire<T>(chemin: string): Promise<T> {
  const reponse = await fetch(`${BASE_COEUR}${chemin}`);
  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => ({}))) as { message?: unknown };
    throw new ErreurApi(
      reponse.status,
      typeof corps.message === "string" ? corps.message : reponse.statusText,
    );
  }
  return (await reponse.json()) as T;
}

/** Client du Catalogue : public, sans connexion (ADR 014). */
export const apiCatalogue = {
  rechercher(criteres: CriteresRecherche): Promise<ResultatRecherche> {
    const parametres = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(criteres)) {
      if (valeur !== undefined && valeur !== "") parametres.set(cle, String(valeur));
    }
    return lire(`/catalogue/recherche?${parametres}`);
  },
  fiche: (evenementId: string) =>
    lire<FicheEvenement>(`/catalogue/evenements/${encodeURIComponent(evenementId)}`),
};
