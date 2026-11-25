import { User, UserManager, WebStorageStateStore } from "oidc-client-ts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { config } from "../commun/config";

/**
 * Connexion par Keycloak en OpenID Connect, flux « code d'autorisation + PKCE »
 * (ADR 010) : l'application ne voit jamais le mot de passe. La bibliothèque
 * oidc-client-ts gère PKCE, l'échange du code et le renouvellement du jeton.
 */
export function creerGestionnaire(origine = window.location.origin): UserManager {
  return new UserManager({
    authority: config.keycloakUrl,
    client_id: config.keycloakClientId,
    redirect_uri: `${origine}/connexion/retour`,
    post_logout_redirect_uri: `${origine}/`,
    response_type: "code",
    scope: "openid profile email",
    // Session limitée à l'onglet : rien ne survit à la fermeture du navigateur.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
  });
}

export interface ContexteAuth {
  utilisateur: User | null;
  chargement: boolean;
  /** Redirige vers Keycloak, puis revient sur `retour` une fois connecté. */
  seConnecter: (retour: string) => Promise<void>;
  seDeconnecter: () => Promise<void>;
  /** Termine la connexion au retour de Keycloak et renvoie l'adresse de retour. */
  terminerConnexion: () => Promise<string>;
}

/** Exporté pour les tests, qui fournissent un utilisateur factice. */
export const Contexte = createContext<ContexteAuth | null>(null);

export function FournisseurAuth({
  gestionnaire,
  children,
}: {
  gestionnaire: UserManager;
  children: ReactNode;
}) {
  const [utilisateur, setUtilisateur] = useState<User | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let actif = true;
    void gestionnaire.getUser().then((u) => {
      if (!actif) return;
      setUtilisateur(u && !u.expired ? u : null);
      setChargement(false);
    });
    const surChargement = (u: User) => setUtilisateur(u);
    const surDeconnexion = () => setUtilisateur(null);
    gestionnaire.events.addUserLoaded(surChargement);
    gestionnaire.events.addUserUnloaded(surDeconnexion);
    gestionnaire.events.addAccessTokenExpired(surDeconnexion);
    return () => {
      actif = false;
      gestionnaire.events.removeUserLoaded(surChargement);
      gestionnaire.events.removeUserUnloaded(surDeconnexion);
      gestionnaire.events.removeAccessTokenExpired(surDeconnexion);
    };
  }, [gestionnaire]);

  const seConnecter = useCallback(
    (retour: string) => gestionnaire.signinRedirect({ state: { retour } }),
    [gestionnaire],
  );
  const seDeconnecter = useCallback(() => gestionnaire.signoutRedirect(), [gestionnaire]);
  const terminerConnexion = useCallback(async () => {
    const u = await gestionnaire.signinRedirectCallback();
    setUtilisateur(u);
    return (u.state as { retour?: string } | undefined)?.retour ?? "/";
  }, [gestionnaire]);

  const valeur = useMemo(
    () => ({ utilisateur, chargement, seConnecter, seDeconnecter, terminerConnexion }),
    [utilisateur, chargement, seConnecter, seDeconnecter, terminerConnexion],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useAuth(): ContexteAuth {
  const contexte = useContext(Contexte);
  if (!contexte) throw new Error("useAuth doit être utilisé dans <FournisseurAuth>");
  return contexte;
}
