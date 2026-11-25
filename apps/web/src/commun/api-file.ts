import { config } from "./config";

/** État d'un acheteur dans la file, tel que renvoyé par la File d'attente (ADR 009). */
export type EtatFile =
  | {
      statut: "en_attente";
      position: number;
      attenteEstimeeSec: number;
      prochainAppelDansSec: number;
      ouvertureLe: string;
    }
  | { statut: "admis"; jetonAcces: string; expireLe: string }
  | { statut: "absent" };

export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

/** Client de la File d'attente : chaque appel porte le jeton Keycloak de l'acheteur. */
export function creerApiFile(jeton: () => string | undefined, base = config.apiFile) {
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

  const evt = (evenementId: string) => `/files/${encodeURIComponent(evenementId)}`;
  return {
    consulter: (evenementId: string) => appeler<EtatFile>(`${evt(evenementId)}/position`),
    obtenirDefi: (evenementId: string) => appeler<unknown>(`${evt(evenementId)}/defi`),
    entrer: (evenementId: string, altcha: string) =>
      appeler<EtatFile>(`${evt(evenementId)}/entrer`, {
        method: "POST",
        body: JSON.stringify({ altcha }),
      }),
  };
}

export type ApiFile = ReturnType<typeof creerApiFile>;
