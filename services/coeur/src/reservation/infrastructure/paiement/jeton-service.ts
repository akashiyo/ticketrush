/** Le jeton est renouvelé un peu avant son expiration, pour ne jamais envoyer un jeton périmé. */
const MARGE_RENOUVELLEMENT_MS = 30_000;

export interface OptionsJetonService {
  urlJeton: string;
  clientId: string;
  clientSecret: string;
  horloge?: () => number;
}

/**
 * Jeton de service du Cœur, obtenu auprès de Keycloak (flux client_credentials, ADR 010).
 * Il autorise les appels au faux prestataire de paiement (audience `ticketrush-faux-paiement`).
 * Mis en cache jusqu'à peu avant son expiration : un seul appel à Keycloak toutes les quelques
 * minutes, même au pic.
 */
export function creerFournisseurJetonService(options: OptionsJetonService): () => Promise<string> {
  const horloge = options.horloge ?? Date.now;
  let enCache: { jeton: string; expireLe: number } | null = null;
  let enCours: Promise<string> | null = null;

  const demander = async (): Promise<string> => {
    const reponse = await fetch(options.urlJeton, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }),
      signal: AbortSignal.timeout(2_000),
    });
    if (!reponse.ok) throw new Error(`Keycloak a refusé le jeton de service (${reponse.status})`);
    const corps = (await reponse.json()) as { access_token: string; expires_in: number };
    enCache = { jeton: corps.access_token, expireLe: horloge() + corps.expires_in * 1000 };
    return corps.access_token;
  };

  return async () => {
    if (enCache && horloge() < enCache.expireLe - MARGE_RENOUVELLEMENT_MS) return enCache.jeton;
    // Plusieurs paiements simultanés partagent la même demande de jeton.
    enCours ??= demander().finally(() => (enCours = null));
    return enCours;
  };
}
