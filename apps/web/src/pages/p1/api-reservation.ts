import { useMemo } from "react";

import { useAuth } from "../../auth/auth";
import { ErreurApi } from "../../commun/api-file";

/** Préfixe des appels au Cœur, routés par Traefik sur la même origine (ADR 013). */
const BASE_COEUR: string = import.meta.env.VITE_API_COEUR ?? "/api";

export interface PlaceAffichee {
  siegeId: string;
  numero: string;
  disponible: boolean;
}

export interface CategorieAffichee {
  categorieId: string;
  libelle: string;
  placement: "numerote" | "libre";
  prixCentimes: number;
  disponibles: number;
  places: PlaceAffichee[];
}

export interface PlanDeSalle {
  evenementId: string;
  categories: CategorieAffichee[];
}

export interface Blocage {
  reservationId: string;
  siegeId: string;
  categorieId: string;
  bloqueJusqua: string;
}

export interface Billet {
  billetId: string;
  reservationId: string;
  evenementId: string;
  siegeId: string;
  prixCentimes: number;
  emisLe: string;
}

export type DemandeBlocage = { siegeId: string } | { categorieId: string };

/** Client de la Réservation du Cœur : chaque appel porte le jeton Keycloak de l'acheteur. */
export function creerApiReservation(jeton: () => string | undefined, base = BASE_COEUR) {
  async function appeler<T>(chemin: string, options: RequestInit = {}): Promise<T> {
    const reponse = await fetch(`${base}${chemin}`, {
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

  const evt = (evenementId: string) => `/evenements/${encodeURIComponent(evenementId)}`;
  return {
    lirePlan: (evenementId: string) => appeler<PlanDeSalle>(`${evt(evenementId)}/plan`),
    /** Le jeton d'accès remis par la File accompagne la demande (ADR 011). */
    bloquer: (evenementId: string, jetonAcces: string, demande: DemandeBlocage) =>
      appeler<Blocage>(`${evt(evenementId)}/blocages`, {
        method: "POST",
        headers: { "Jeton-Acces": jetonAcces },
        body: JSON.stringify(demande),
      }),
    /** Une même clé rejouée (double clic, nouvel essai) ne paie qu'une fois (ADR 005). */
    payer: (reservationId: string, cleIdempotence: string, jetonCarte: string) =>
      appeler<Billet>(`/reservations/${encodeURIComponent(reservationId)}/paiement`, {
        method: "POST",
        headers: { "Idempotency-Key": cleIdempotence },
        body: JSON.stringify({ moyenDePaiement: { jeton: jetonCarte } }),
      }),
  };
}

export type ApiReservation = ReturnType<typeof creerApiReservation>;

/** Client branché sur le jeton de l'utilisateur connecté. */
export function useApiReservation(): ApiReservation {
  const { utilisateur } = useAuth();
  return useMemo(() => creerApiReservation(() => utilisateur?.access_token), [utilisateur]);
}
