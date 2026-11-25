import { useMemo } from "react";

import { useAuth } from "../../auth/auth";
import { ErreurApi } from "../../commun/api-file";

const BASE_COEUR: string = import.meta.env.VITE_API_COEUR ?? "/api";

export interface Tarif {
  id: string;
  libelle: string;
  placement: "numerote" | "libre";
  capacite: number;
  prixCentimes: number;
}

export interface Ventes {
  places: number;
  vendues: number;
  bloquees: number;
  recetteCentimes: number;
}

export interface EvenementOrganisateur {
  id: string;
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: { id: string; nom: string; ville: string };
  debutLe: string;
  statut: "brouillon" | "publie";
  version: number;
  tarifs: Tarif[];
  ventes?: Ventes;
}

export interface Salle {
  id: string;
  nom: string;
  ville: string;
}

export interface LigneJournal {
  le: string;
  utilisateurId: string;
  action: string;
  objetId: string;
}

export interface NouvelEvenement {
  titre: string;
  artiste: string | null;
  salleId: string;
  debutLe: string;
  tarifs: Omit<Tarif, "id">[];
}

/** Client du back-office : l'organisation n'est jamais envoyée, le Cœur la lit dans le jeton. */
export function creerApiOrganisateur(jeton: () => string | undefined, base = BASE_COEUR) {
  async function appeler<T>(chemin: string, options: RequestInit = {}): Promise<T> {
    const reponse = await fetch(`${base}/organisateur${chemin}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jeton() ?? ""}`,
        ...options.headers,
      },
    });
    if (!reponse.ok) {
      const corps = (await reponse.json().catch(() => ({}))) as { message?: unknown };
      const message = typeof corps.message === "string" ? corps.message : reponse.statusText;
      throw new ErreurApi(reponse.status, message);
    }
    return (await reponse.json()) as T;
  }
  return {
    evenements: () => appeler<EvenementOrganisateur[]>("/evenements"),
    salles: () => appeler<Salle[]>("/salles"),
    journal: () => appeler<LigneJournal[]>("/journal"),
    creer: (e: NouvelEvenement) =>
      appeler<EvenementOrganisateur>("/evenements", { method: "POST", body: JSON.stringify(e) }),
    publier: (id: string) =>
      appeler<EvenementOrganisateur>(`/evenements/${id}/publication`, { method: "POST" }),
    changerPrix: (id: string, tarifId: string, prixCentimes: number) =>
      appeler<EvenementOrganisateur>(`/evenements/${id}/tarifs/${tarifId}/prix`, {
        method: "PUT",
        body: JSON.stringify({ prixCentimes }),
      }),
  };
}

export type ApiOrganisateur = ReturnType<typeof creerApiOrganisateur>;

export function useApiOrganisateur(): ApiOrganisateur {
  const { utilisateur } = useAuth();
  return useMemo(() => creerApiOrganisateur(() => utilisateur?.access_token), [utilisateur]);
}
