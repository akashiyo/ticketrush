/** Configuration de l'application, fixée à la construction par Vite (variables VITE_*). */
export const config = {
  /** Domaine Keycloak : émetteur des jetons (ADR 010). */
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL ?? "http://localhost:8000/auth/realms/ticketrush",
  /** Client public de l'application web : code d'autorisation + PKCE. */
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "ticketrush-web",
  /** Préfixe des appels à la File d'attente, routés par Traefik (même origine). */
  apiFile: import.meta.env.VITE_API_FILE ?? "/api/file",
};
